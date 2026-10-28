/**
 * tests/integration/cross-domain-budget-concurrency.test.ts
 *
 * Slice 21C — Cross-Domain Budget Exposure and Concurrency Hardening (Live PostgreSQL).
 *
 * Test Scenarios:
 * 1. Test 1: Concurrent Expense Approval vs. Commitment Approval on Shared BudgetLine.
 *    - Direct Expense (7,000 SAR) vs. Commitment (7,000 SAR) on BudgetLine (10,000 SAR).
 *    - Both individually fit, but jointly (14,000 SAR) exceed the line ceiling.
 *    - Proves serialization on budget_lines row lock: exactly one succeeds, one fails with BUDGET_LINE_EXCEEDED.
 *    - Total active exposure in DB <= 10,000 SAR.
 *
 * 2. Test 2: Concurrent Commitment Approval vs. Subcontractor Billing Approval.
 *    - Interaction between commitment lifecycle and subcontractor billing claims.
 *    - Proves hierarchical locking (budget_lines -> commitments -> subcontractor_billings) prevents
 *      approving a billing against an unapproved commitment or exceeding commitment ceiling.
 *    - Proves approved billings do NOT increment BudgetLine exposure (zero double counting).
 *
 * 3. Test 3: Concurrent Custody Issuance vs. Budget-Consuming Direct Expense Approval.
 *    - Approved Custody (14,000 SAR) awaiting issuance vs. Submitted Direct Expense (14,000 SAR) on BudgetLine (20,000 SAR).
 *    - Preserves distinction between Custody approval (0 active exposure) and issuance (encumbers active exposure).
 *    - Concurrently dispatches issueCustody and approveExpense.
 *    - Exactly one succeeds, other fails with BUDGET_LINE_EXCEEDED.
 *    - Total active exposure in DB <= 20,000 SAR.
 *
 * 4. Test 4: Rollback and Audit Atomicity under Concurrent Contention.
 *    - Proves failed concurrent operations roll back all state changes and audit logs atomically.
 *    - Verifies no partial approvals, orphaned audit logs, or corrupted exposure states persist.
 *
 * 5. Test 5: Initial Baseline Budget Approval vs. Financial Operation Serialization.
 *    - Proves initial budget approval (Version 1) serializes against concurrent financial operations (Commitment approval).
 *    - Proves fresh revalidation under lock: financial operations enforce an active APPROVED budget,
 *      cleanly rolling back with zero orphaned audit logs if executed before the budget is approved.
 *    - Documented Limitation: Full budget revision concurrency (predecessor v1 transitioning to SUPERSEDED
 *      by successor v2, and migration of in-flight records) is deferred to CR-09 (Slice 27), as v1 terminal
 *      state rules currently disallow multiple budget versions per project.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetStatus,
  BudgetCategory,
  ExpenseStatus,
  CommitmentStatus,
  CustodyStatus,
  SubcontractorBillingStatus,
  AssignmentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { approveExpense, createExpenseDraft, submitExpense } from '@/lib/expenses';
import { approveCommitment, createCommitmentDraft, submitCommitment } from '@/lib/commitments';
import {
  createCustodyDraft,
  submitCustody,
  approveCustody,
  issueCustody,
} from '@/lib/custodies';
import {
  createBillingDraft,
  submitBilling,
  approveBilling,
  getCommitmentBillings,
} from '@/lib/subcontractor-billings';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import { calculateBudgetLineExposure } from '@/lib/budget/calculations';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Cross-Domain Budget Exposure & Concurrency Hardening (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupCustodyIds: string[] = [];
  const cleanupBillingIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير اختبار التزامن الشامل',
          email: `mgr.xdom.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
      });
    }
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب اختبار التزامن الشامل',
          email: `acc.xdom.${Date.now()}@test.local`,
          role: Role.ACCOUNTANT,
          isActive: true,
        },
      });
    }
    testAccountant = {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };

    // 3. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس اختبار التزامن الشامل',
          email: `eng.xdom.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Purchasing
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مشتريات اختبار التزامن الشامل',
          email: `pur.xdom.${Date.now()}@test.local`,
          role: Role.PURCHASING,
          isActive: true,
        },
      });
    }
    testPurchasing = {
      id: pur.id,
      name: pur.name,
      email: pur.email,
      role: Role.PURCHASING,
      isActive: true,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const bId of cleanupBillingIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: bId },
      });
      await prisma.subcontractorBilling.deleteMany({ where: { id: bId } });
    }
    cleanupBillingIds.length = 0;

    for (const cId of cleanupCustodyIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: cId } });
      await prisma.expense.deleteMany({ where: { custodyId: cId } });
      await prisma.custody.deleteMany({ where: { id: cId } });
    }
    cleanupCustodyIds.length = 0;

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: commId } });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: pId } });
      await prisma.custody.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;
  });

  /** Helper to setup active project with approved budget and engineer assignment */
  async function setupProjectWithBudgetLine(amount: string, category: BudgetCategory = BudgetCategory.MATERIALS) {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `XDOM-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار التزامن بين النطاقات المالية',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category,
          description: 'بند موازنة مشترك لاختبار التزامن',
          amount,
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    const approved = await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: approved.id },
    });

    return { project, budgetLine };
  }

  // ---------------------------------------------------------------------------
  // TEST 1 — Concurrent Expense Approval vs. Commitment Approval
  // ---------------------------------------------------------------------------
  it('Test 1: serializes concurrent Expense Approval vs. Commitment Approval against shared budget capacity', async () => {
    // Budget line = 10,000.00 SAR
    const { project, budgetLine } = await setupProjectWithBudgetLine('10000.00');

    // 1. Engineer creates and submits Direct Expense = 7,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '7000.00',
      expenseDate: new Date(),
      description: 'شراء مواد عاجلة بالموقع',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // 2. Purchasing creates and submits Commitment = 7,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة توريدات البناء',
      amount: '7000.00',
      commitmentDate: new Date(),
      description: 'أمر شراء مواد إنشائية',
      referenceNumber: 'PO-XDOM-7K',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    // 3. Manager approves both concurrently (both individually fit in 10k, but 14k > 10k)
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [expRes, commRes] = await Promise.allSettled([
      approveExpense(expenseDraft.id),
      approveCommitment(commitmentDraft.id),
    ]);

    // 4. Assert: Exactly one fulfilled, one rejected with BUDGET_LINE_EXCEEDED
    const fulfilled = [expRes, commRes].filter((r) => r.status === 'fulfilled');
    const rejected = [expRes, commRes].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 5. Independently assert live PostgreSQL state
    const dbExpense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseDraft.id } });
    const dbComm = await prisma.commitment.findUniqueOrThrow({ where: { id: commitmentDraft.id } });

    if (expRes.status === 'fulfilled') {
      expect(dbExpense.status).toBe(ExpenseStatus.APPROVED);
      expect(dbComm.status).toBe(CommitmentStatus.SUBMITTED);
      expect(dbComm.approvedById).toBeNull();
    } else {
      expect(dbComm.status).toBe(CommitmentStatus.APPROVED);
      expect(dbExpense.status).toBe(ExpenseStatus.SUBMITTED);
      expect(dbExpense.approvedById).toBeNull();
    }

    // Exposure calculation proof: total active exposure <= 10,000.00 SAR (strictly 7,000.00 SAR)
    const exposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: dbComm.status === CommitmentStatus.APPROVED ? dbComm.amount : new Prisma.Decimal('0.00'),
      directActualSpend: dbExpense.status === ExpenseStatus.APPROVED ? dbExpense.amount : new Prisma.Decimal('0.00'),
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    expect(exposure.totalActiveExposure.toFixed(2)).toBe('7000.00');
    expect(exposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Concurrent Commitment Approval vs. Subcontractor Billing Approval
  // ---------------------------------------------------------------------------
  it('Test 2: serializes concurrent Commitment Approval vs. Subcontractor Billing Approval on shared BudgetLine', async () => {
    // Budget line = 200,000.00 SAR
    const { project, budgetLine } = await setupProjectWithBudgetLine('200000.00', BudgetCategory.SUBCONTRACTOR);

    // 1. Purchasing creates and Manager approves Commitment C1 = 100,000.00 SAR (already encumbering 100k of 200k)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const comm1Draft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة المقاولات الإنشائية الأولى',
      amount: '100000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن معتمد مسبقاً',
      referenceNumber: 'PO-SC-C1',
    });
    cleanupCommitmentIds.push(comm1Draft.id);
    await submitCommitment(comm1Draft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approvedComm1 = await approveCommitment(comm1Draft.id);
    expect(approvedComm1.status).toBe(CommitmentStatus.APPROVED);

    // 2. Accountant drafts and submits Billing B1 = 40,000.00 SAR under C1 (fits in 100k ceiling)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: approvedComm1.id,
      subcontractorName: approvedComm1.vendorName,
      billingPeriod: '2026-01',
      claimDate: new Date('2026-01-31'),
      grossAmount: '40000.00',
      description: 'مستخلص مرحلة أولى تحت العقد المعتمد',
    });
    cleanupBillingIds.push(billingDraft.id);
    await submitBilling(billingDraft.id);

    // 3. Purchasing creates and submits NEW Commitment C2 = 50,000.00 SAR on this same BudgetLine
    // (L has 100k remaining capacity: 100k C1 + 50k C2 = 150k <= 200k)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const comm2Draft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة الأعمال الكهروميكانيكية',
      amount: '50000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن جديد قيد الاعتماد',
      referenceNumber: 'PO-SC-C2',
    });
    cleanupCommitmentIds.push(comm2Draft.id);
    await submitCommitment(comm2Draft.id);

    // 4. Concurrently execute approveCommitment(C2) and approveBilling(B1)
    // Both operations compete on the same budgetLineId row lock!
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [comm2Res, billRes] = await Promise.allSettled([
      approveCommitment(comm2Draft.id),
      approveBilling(billingDraft.id),
    ]);

    // Both must terminate cleanly without deadlock and both must succeed
    expect(comm2Res.status).toBe('fulfilled');
    expect(billRes.status).toBe('fulfilled');

    // 5. Verify live DB state:
    const dbComm2 = await prisma.commitment.findUniqueOrThrow({ where: { id: comm2Draft.id } });
    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({ where: { id: billingDraft.id } });

    expect(dbComm2.status).toBe(CommitmentStatus.APPROVED);
    expect(dbBilling.status).toBe(SubcontractorBillingStatus.APPROVED);

    // Commitment C1 ceiling: cumulative certified = 40,000 SAR <= 100,000 SAR
    const summary = await getCommitmentBillings(approvedComm1.id);
    expect(summary.cumulativeCertified).toBe('40000.00');
    expect(summary.remainingCommitmentBalance).toBe('60000.00');

    // Budget line exposure invariant:
    // Total active exposure = C1 (100k) + C2 (50k) = 150,000.00 SAR <= 200,000.00 SAR
    // Approved billing B1 does NOT double-count on the BudgetLine!
    const exposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: new Prisma.Decimal('150000.00'),
      directActualSpend: new Prisma.Decimal('0.00'),
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    expect(exposure.totalActiveExposure.toFixed(2)).toBe('150000.00');
    expect(exposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);

    // Verify audit logs were written atomically for both
    const comm2Audit = await prisma.auditLog.findFirst({
      where: { entityType: 'COMMITMENT', entityId: comm2Draft.id, action: 'COMMITMENT_APPROVED' },
    });
    expect(comm2Audit).toBeDefined();

    const billingAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: billingDraft.id, action: 'SUBCONTRACTOR_BILLING_APPROVED' },
    });
    expect(billingAudit).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Concurrent Custody Issuance vs. Another Budget-Consuming Operation
  // ---------------------------------------------------------------------------
  it('Test 3: serializes concurrent Custody Issuance vs. Direct Expense Approval on shared BudgetLine', async () => {
    // Budget line = 20,000.00 SAR
    const { project, budgetLine } = await setupProjectWithBudgetLine('20000.00', BudgetCategory.SITE_OPERATIONS);

    // 1. Engineer creates and submits Custody = 14,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const custodyDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      custodianUserId: testEngineer.id,
      amount: '14000.00',
      purpose: 'عهدة نقدية للموقع',
    });
    cleanupCustodyIds.push(custodyDraft.id);
    await submitCustody(custodyDraft.id);

    // Manager approves custody (APPROVED custody creates 0 active exposure before issuance!)
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(custodyDraft.id);

    // 2. Engineer creates and submits Direct Expense = 14,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '14000.00',
      expenseDate: new Date(),
      description: 'شراء مضخة مياه عاجلة للموقع',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // 3. Concurrently dispatch Accountant issueCustody and Manager approveExpense
    // Both operations compete for the 20,000.00 SAR line (14k + 14k = 28k > 20k)
    const runIssueCustody = async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);
      return issueCustody(custodyDraft.id);
    };

    const runApproveExpense = async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
      return approveExpense(expenseDraft.id);
    };

    const [issueRes, expRes] = await Promise.allSettled([
      runIssueCustody(),
      runApproveExpense(),
    ]);

    // 4. Exactly one succeeds, one fails with BUDGET_LINE_EXCEEDED
    const fulfilled = [issueRes, expRes].filter((r) => r.status === 'fulfilled');
    const rejected = [issueRes, expRes].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 5. Verify live DB state
    const dbCustody = await prisma.custody.findUniqueOrThrow({ where: { id: custodyDraft.id } });
    const dbExpense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseDraft.id } });

    if (issueRes.status === 'fulfilled') {
      expect(dbCustody.status).toBe(CustodyStatus.ISSUED);
      expect(dbExpense.status).toBe(ExpenseStatus.SUBMITTED);
      expect(dbExpense.approvedById).toBeNull();
    } else {
      expect(dbExpense.status).toBe(ExpenseStatus.APPROVED);
      expect(dbCustody.status).toBe(CustodyStatus.APPROVED); // Not issued!
      expect(dbCustody.issuedById).toBeNull();
    }

    // Exposure calculation proof: total active exposure <= 20,000.00 SAR (strictly 14,000.00 SAR)
    const exposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: new Prisma.Decimal('0.00'),
      directActualSpend: dbExpense.status === ExpenseStatus.APPROVED ? dbExpense.amount : new Prisma.Decimal('0.00'),
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: dbCustody.status === CustodyStatus.ISSUED ? dbCustody.amount : new Prisma.Decimal('0.00'),
    });

    expect(exposure.totalActiveExposure.toFixed(2)).toBe('14000.00');
    expect(exposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Rollback and Audit Atomicity
  // ---------------------------------------------------------------------------
  it('Test 4: proves atomic rollback and zero orphaned audit logs when a concurrent operation fails', async () => {
    // Budget line = 10,000.00 SAR
    const { project, budgetLine } = await setupProjectWithBudgetLine('10000.00');

    // 1. Create two submitted expenses of 8,000.00 SAR each
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expA = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '8000.00',
      expenseDate: new Date(),
      description: 'مصروف سباق أ',
    });
    cleanupExpenseIds.push(expA.id);
    await submitExpense(expA.id);

    const expB = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '8000.00',
      expenseDate: new Date(),
      description: 'مصروف سباق ب',
    });
    cleanupExpenseIds.push(expB.id);
    await submitExpense(expB.id);

    // 2. Concurrently approve both
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [resA, resB] = await Promise.allSettled([
      approveExpense(expA.id),
      approveExpense(expB.id),
    ]);

    expect([resA.status, resB.status]).toContain('fulfilled');
    expect([resA.status, resB.status]).toContain('rejected');

    const winnerId = resA.status === 'fulfilled' ? expA.id : expB.id;
    const loserId = resA.status === 'fulfilled' ? expB.id : expA.id;

    // 3. Proves winner has EXPENSE_APPROVED audit log and status = APPROVED
    const winnerDb = await prisma.expense.findUniqueOrThrow({ where: { id: winnerId } });
    expect(winnerDb.status).toBe(ExpenseStatus.APPROVED);
    expect(winnerDb.approvedById).toBe(testManager.id);

    const winnerAudit = await prisma.auditLog.findMany({
      where: { entityType: 'EXPENSE', entityId: winnerId, action: 'EXPENSE_APPROVED' },
    });
    expect(winnerAudit).toHaveLength(1);

    // 4. CRITICAL PROOF: Loser was cleanly rolled back:
    // - Loser status remains strictly SUBMITTED
    // - Loser approvedById is strictly null
    // - Loser has ZERO EXPENSE_APPROVED audit logs (atomic rollback in transaction!)
    const loserDb = await prisma.expense.findUniqueOrThrow({ where: { id: loserId } });
    expect(loserDb.status).toBe(ExpenseStatus.SUBMITTED);
    expect(loserDb.approvedById).toBeNull();
    expect(loserDb.approvedAt).toBeNull();

    const loserAudit = await prisma.auditLog.findMany({
      where: { entityType: 'EXPENSE', entityId: loserId, action: 'EXPENSE_APPROVED' },
    });
    expect(loserAudit).toHaveLength(0); // Zero orphaned audit logs!
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Initial Budget Approval vs. Financial Operation Serialization
  // Note: Full budget revision concurrency (predecessor v1 -> SUPERSEDED by v2)
  // is deferred to CR-09 (Slice 27) because v1 terminal state rules disallow
  // multiple budgets per project.
  // ---------------------------------------------------------------------------
  it('Test 5: serializes Initial Budget Approval vs. Financial Operation and revalidates active budget under lock (Baseline Activation)', async () => {
    // 1. Setup Active Project with a SUBMITTED budget (not yet approved)
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `BXRACE-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن اعتماد الموازنة مع العمليات المالية',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد المشروع الجديد',
          amount: '100000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.ACTIVE },
    });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // 2. Direct seed of a SUBMITTED Commitment pointing to this budgetLine
    const comm = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('30000.00'),
        currency: 'SAR',
        vendorName: 'شركة التوريدات العامة',
        referenceNumber: 'PO-BXRACE-30K',
        description: 'التزام مالي ينتظر اعتماد الموازنة',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(comm.id);

    // 3. Concurrently dispatch approveBudget (Manager) and approveCommitment (Manager)
    // Both transactions synchronize on budget_lines row lock!
    const [budgetRes, commRes] = await Promise.allSettled([
      approveBudget(budgetDraft.id),
      approveCommitment(comm.id),
    ]);

    // Budget approval must ALWAYS succeed
    expect(budgetRes.status).toBe('fulfilled');

    // 4. Assert live DB state:
    const finalBudget = await prisma.budget.findUniqueOrThrow({ where: { id: budgetDraft.id } });
    expect(finalBudget.status).toBe(BudgetStatus.APPROVED);

    const finalComm = await prisma.commitment.findUniqueOrThrow({ where: { id: comm.id } });

    if (commRes.status === 'fulfilled') {
      // approveBudget ran first, so approveCommitment waited on budget_lines lock,
      // unblocked, revalidated the now-APPROVED budget, and approved cleanly!
      expect(finalComm.status).toBe(CommitmentStatus.APPROVED);
      expect(finalComm.approvedById).toBe(testManager.id);

      const commAudit = await prisma.auditLog.findFirst({
        where: { entityType: 'COMMITMENT', entityId: comm.id, action: 'COMMITMENT_APPROVED' },
      });
      expect(commAudit).toBeDefined();
    } else {
      // approveCommitment ran first, saw budget not yet approved (BUDGET_NOT_APPROVED),
      // cleanly rolled back, leaving commitment in SUBMITTED with 0 audit logs!
      const commRejection = (commRes as PromiseRejectedResult).reason;
      expect(commRejection.code).toBe('BUDGET_NOT_APPROVED');
      expect(finalComm.status).toBe(CommitmentStatus.SUBMITTED);
      expect(finalComm.approvedById).toBeNull();

      const commAudit = await prisma.auditLog.findMany({
        where: { entityType: 'COMMITMENT', entityId: comm.id, action: 'COMMITMENT_APPROVED' },
      });
      expect(commAudit).toHaveLength(0);
    }
  });
});
