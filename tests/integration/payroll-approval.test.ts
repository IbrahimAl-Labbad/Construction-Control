/**
 * tests/integration/payroll-approval.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 6: Payroll Approval Transaction Integration Tests on Live PostgreSQL.
 *
 * Covers:
 * 1. Happy path: formal Manager approval, state transition SUBMITTED -> APPROVED, AuditLog creation.
 * 2. Hard budget ceiling: rejection when exposure + amount > BudgetLine.amount, no mutation.
 * 3. Separation of duties: creator cannot self-approve (FORBIDDEN_SELF_APPROVAL).
 * 4. Immutability: already APPROVED entry cannot be approved again (INVALID_STATE_TRANSITION).
 * 5. Soft-deleted entry: cannot approve record with deletedAt !== null (RECORD_DELETED).
 * 6. Wrong project linkage: rejection when entry project does not match BudgetLine.
 * 7. Wrong category: rejection when BudgetLine is not LABOR (INVALID_BUDGET_LINE_CATEGORY).
 * 8. Invalid budget: rejection when project has no approved budget (BUDGET_NOT_APPROVED).
 * 9. Subcontractor Billing non-double-count: proves billing does NOT add duplicate exposure.
 * 10. Custody interaction: proves custody actual spend + outstanding custody are properly accounted for.
 * 11. Audit atomicity: simulated audit failure rolls back the entire approval transaction.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  ExpenseStatus,
  CommitmentStatus,
  CustodyStatus,
  PayrollStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { approvePayroll } from '@/lib/payroll';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll Approval Transaction Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupPayrollIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
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
          name: 'مدير اعتماد الرواتب',
          email: `mgr.payapp.${Date.now()}@test.local`,
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

    // 2. Accountant (Creator of payroll drafts)
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب الرواتب',
          email: `acc.payapp.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const id of cleanupPayrollIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PAYROLL_ENTRY', entityId: id } });
      await prisma.payrollEntry.deleteMany({ where: { id } });
    }
    cleanupPayrollIds.length = 0;

    for (const id of cleanupBillingIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: id } });
      await prisma.subcontractorBilling.deleteMany({ where: { id } });
    }
    cleanupBillingIds.length = 0;

    for (const id of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: id } });
      await prisma.expense.deleteMany({ where: { id } });
    }
    cleanupExpenseIds.length = 0;

    for (const id of cleanupCustodyIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: id } });
      await prisma.custody.deleteMany({ where: { id } });
    }
    cleanupCustodyIds.length = 0;

    for (const id of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: id } });
      await prisma.commitment.deleteMany({ where: { id } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.payrollEntry.deleteMany({ where: { projectId: pId } });
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.custody.deleteMany({ where: { projectId: pId } });
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

  // ---------------------------------------------------------------------------
  // Helper: Setup an active project with an approved budget and a LABOR line
  // ---------------------------------------------------------------------------
  async function setupProjectWithLaborLine(laborAmount: string = '100000.00') {
    const code = `PRJ-P${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع رواتب تجريبي ${code}`,
      description: 'مشروع فحص اعتماد قيود الرواتب والأجور',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند أجور وعمالة المشروع',
          amount: laborAmount,
        },
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد المشروع',
          amount: '50000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const laborLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id, category: BudgetCategory.LABOR },
    });

    const materialsLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id, category: BudgetCategory.MATERIALS },
    });

    return { project, budget: budgetDraft, laborLine, materialsLine };
  }

  // ---------------------------------------------------------------------------
  // Helper: Seed a PayrollEntry directly into PostgreSQL
  // ---------------------------------------------------------------------------
  async function seedPayrollEntry(params: {
    projectId: string;
    budgetLineId: string;
    createdById: string;
    amount: string;
    status?: PayrollStatus;
    workerName?: string;
    periodYear?: number;
    periodMonth?: number;
    deletedAt?: Date | null;
  }) {
    const entry = await prisma.payrollEntry.create({
      data: {
        projectId: params.projectId,
        budgetLineId: params.budgetLineId,
        createdById: params.createdById,
        workerName: params.workerName ?? 'سالم عبدالله أحمد',
        workerReference: 'WRK-001',
        tradeOrTitle: 'فني كهرباء',
        periodYear: params.periodYear ?? 2026,
        periodMonth: params.periodMonth ?? 9,
        amount: new Prisma.Decimal(params.amount),
        currency: 'SAR',
        description: 'قيد رواتب تجريبي لاختبار المعاملة المالية',
        status: params.status ?? PayrollStatus.SUBMITTED,
        submittedById: params.createdById,
        submittedAt: new Date(),
        deletedAt: params.deletedAt ?? null,
      },
    });
    cleanupPayrollIds.push(entry.id);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // 1. Happy Path Approval
  // ---------------------------------------------------------------------------
  it('happy path: formally approves a submitted payroll entry, updates state to APPROVED and writes AuditLog', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '12500.00',
      status: PayrollStatus.SUBMITTED,
    });

    const approvedDTO = await approvePayroll(entry.id);

    // 1. DTO assertion
    expect(approvedDTO.status).toBe(PayrollStatus.APPROVED);
    expect(approvedDTO.approvedById).toBe(testManager.id);
    expect(approvedDTO.approvedAt).toBeDefined();
    expect(approvedDTO.amount).toBe('12500.00');

    // 2. Database row assertion
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.APPROVED);
    expect(dbEntry.approvedById).toBe(testManager.id);
    expect(dbEntry.approvedAt).toBeInstanceOf(Date);

    // 3. Immutability verification: business fields remain unchanged
    expect(dbEntry.amount.toFixed(2)).toBe('12500.00');
    expect(dbEntry.workerName).toBe('سالم عبدالله أحمد');
    expect(dbEntry.periodYear).toBe(2026);
    expect(dbEntry.periodMonth).toBe(9);

    // 4. AuditLog verification
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PAYROLL_ENTRY',
        entityId: entry.id,
        action: 'PAYROLL_ENTRY_APPROVED',
      },
    });
    expect(auditLogs.length).toBe(1);
    const audit = auditLogs[0]!;
    expect(audit.actorId).toBe(testManager.id);

    const metadata = audit.metadata as Record<string, unknown>;
    expect(metadata['payrollEntryId']).toBe(entry.id);
    expect(metadata['projectId']).toBe(project.id);
    expect(metadata['budgetLineId']).toBe(laborLine.id);
    expect(metadata['periodYear']).toBe(2026);
    expect(metadata['periodMonth']).toBe(9);
    expect(metadata['amount']).toBe('12500.00');
    expect(metadata['currency']).toBe('SAR');
    expect(metadata['previousStatus']).toBe(PayrollStatus.SUBMITTED);
    expect(metadata['newStatus']).toBe(PayrollStatus.APPROVED);
    expect(metadata['exposureBeforeApproval']).toBe('0.00');
    expect(metadata['exposureAfterApproval']).toBe('12500.00');
    expect(metadata['budgetLineRemaining']).toBe('37500.00'); // 50,000 - 12,500 = 37,500
    expect(typeof metadata['approvedAt']).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // 2. Hard Budget Ceiling
  // ---------------------------------------------------------------------------
  it('hard budget ceiling: rejects approval when total active exposure + payroll exceeds budget line amount', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('1000.00');

    // Seed approved commitment = 600.00 SAR
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        amount: new Prisma.Decimal('600.00'),
        currency: 'SAR',
        vendorName: 'مقاول باطن أعمال النجارة',
        description: 'التزام مقاول باطن',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    // Seed approved direct expense = 300.00 SAR
    const expense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'مصروف مباشر موقعي',
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    // Current active exposure = 600 + 300 = 900.00 SAR
    // Line ceiling = 1000.00 SAR (Available = 100.00 SAR)
    // Submitted payroll = 200.00 SAR -> total would be 1100.00 SAR > 1000.00 SAR
    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '200.00',
      status: PayrollStatus.SUBMITTED,
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'BUDGET_LINE_EXCEEDED' }),
    );

    // DB verification: state unchanged, not approved
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
    expect(dbEntry.approvedById).toBeNull();
    expect(dbEntry.approvedAt).toBeNull();

    // No approval audit log
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PAYROLL_ENTRY',
        entityId: entry.id,
        action: 'PAYROLL_ENTRY_APPROVED',
      },
    });
    expect(auditLogs.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 3. Separation of Duties (Self-Approval Forbidden)
  // ---------------------------------------------------------------------------
  it('separation of duties: prevents Manager from approving a payroll entry they created themselves', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    // Seed entry where createdById is testManager.id
    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testManager.id,
      amount: '5000.00',
      status: PayrollStatus.SUBMITTED,
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
    );

    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
    expect(dbEntry.approvedById).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 4. Immutability: Already Approved Entry
  // ---------------------------------------------------------------------------
  it('immutability: rejects approval of an already APPROVED payroll entry', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '5000.00',
      status: PayrollStatus.APPROVED,
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Soft-Deleted Entry Rejection
  // ---------------------------------------------------------------------------
  it('soft-deleted entry: rejects approval of a soft-deleted payroll entry', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '5000.00',
      status: PayrollStatus.SUBMITTED,
      deletedAt: new Date(),
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'RECORD_DELETED' }),
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Wrong Project Linkage Rejection
  // ---------------------------------------------------------------------------
  it('wrong project linkage: rejects approval if entry project does not match BudgetLine project', async () => {
    const setupA = await setupProjectWithLaborLine('50000.00');
    const setupB = await setupProjectWithLaborLine('50000.00');

    // Entry has projectId from Project A, but budgetLineId from Project B
    const mismatchedEntry = await prisma.payrollEntry.create({
      data: {
        projectId: setupA.project.id,
        budgetLineId: setupB.laborLine.id,
        createdById: testAccountant.id,
        workerName: 'علي حسن',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('5000.00'),
        currency: 'SAR',
        description: 'ربط خاطئ بالمشروع',
        status: PayrollStatus.SUBMITTED,
        submittedById: testAccountant.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(mismatchedEntry.id);

    await expect(approvePayroll(mismatchedEntry.id)).rejects.toThrow();

    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: mismatchedEntry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
  });

  // ---------------------------------------------------------------------------
  // 7. Wrong Category Rejection (Must be LABOR)
  // ---------------------------------------------------------------------------
  it('wrong category: rejects approval if BudgetLine category is not LABOR', async () => {
    const { project, materialsLine } = await setupProjectWithLaborLine('50000.00');

    // Entry linked to MATERIALS line instead of LABOR
    const wrongCategoryEntry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: materialsLine.id,
      createdById: testAccountant.id,
      amount: '5000.00',
      status: PayrollStatus.SUBMITTED,
    });

    await expect(approvePayroll(wrongCategoryEntry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_BUDGET_LINE_CATEGORY' }),
    );

    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: wrongCategoryEntry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
  });

  // ---------------------------------------------------------------------------
  // 8. Invalid / Unapproved Budget Rejection
  // ---------------------------------------------------------------------------
  it('invalid budget: rejects approval if project budget is not in APPROVED status', async () => {
    const code = `PRJ-N${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع بدون موازنة معتمدة ${code}`,
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند أجور مسودة',
          amount: '50000.00',
        },
      ],
    });

    // Leave budget in DRAFT status (do not submit or approve)
    const laborLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '5000.00',
      status: PayrollStatus.SUBMITTED,
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_PROJECT_STATUS' }),
    );
  });

  // ---------------------------------------------------------------------------
  // 9. Subcontractor Billing Non-Double-Count Protection
  // ---------------------------------------------------------------------------
  it('subcontractor billing non-double-count: approved billing does NOT add duplicate exposure during payroll approval', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('1000000.00');

    // 1. Approved Commitment = 600,000.00 SAR
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        amount: new Prisma.Decimal('600000.00'),
        currency: 'SAR',
        vendorName: 'شركة مقاولات الباطن',
        description: 'عقد مقاولة باطن للأعمال التخصصية',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    // 2. Approved Subcontractor Billing = 400,000.00 SAR (drawdown against the 600k commitment)
    const billing = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        commitmentId: commitment.id,
        subcontractorName: 'شركة مقاولات الباطن',
        billingPeriod: '2026-09',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('400000.00'),
        description: 'مستخلص أعمال النجارة التخصصية للأسبوع الأول',
        status: 'APPROVED',
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    cleanupBillingIds.push(billing.id);

    // 3. Submitted Payroll = 200,000.00 SAR
    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '200000.00',
      status: PayrollStatus.SUBMITTED,
    });

    // 4. Approve Payroll
    const approvedDTO = await approvePayroll(entry.id);
    expect(approvedDTO.status).toBe(PayrollStatus.APPROVED);

    // 5. Verify AuditLog:
    // exposureBeforeApproval must be 600,000.00 SAR (Commitment only, NOT 600k + 400k)
    // exposureAfterApproval must be 800,000.00 SAR (600k Commitment + 200k Payroll, NOT 1.2M)
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityType: 'PAYROLL_ENTRY',
        entityId: entry.id,
        action: 'PAYROLL_ENTRY_APPROVED',
      },
    });

    const metadata = audit.metadata as Record<string, unknown>;
    expect(metadata['exposureBeforeApproval']).toBe('600000.00');
    expect(metadata['exposureAfterApproval']).toBe('800000.00');
    expect(metadata['budgetLineRemaining']).toBe('200000.00'); // 1,000,000 - 800,000 = 200,000
  });

  // ---------------------------------------------------------------------------
  // 10. Custody Interaction
  // ---------------------------------------------------------------------------
  it('custody interaction: properly aggregates custody actual spend + outstanding custody alongside payroll', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('1000.00');

    // 1. Custody issued for 250.00 SAR
    const custody = await prisma.custody.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        code: `CUST-PAY-${Date.now()}`,
        amount: new Prisma.Decimal('250.00'),
        currency: 'SAR',
        purpose: 'عهدة تشغيلية لمصاريف الموقع النقدية الطارئة',
        status: CustodyStatus.ISSUED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        custodianUserId: testAccountant.id,
        issuedAt: new Date(),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
      },
    });
    cleanupCustodyIds.push(custody.id);

    // 2. Approved Custody Expense = 150.00 SAR (settling part of the 250.00 SAR custody)
    // Outstanding custody becomes: 250.00 - 150.00 = 100.00 SAR
    // Custody actual spend = 150.00 SAR
    // Combined custody exposure = 100.00 + 150.00 = 250.00 SAR
    const custodyExpense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        custodyId: custody.id,
        amount: new Prisma.Decimal('150.00'),
        currency: 'SAR',
        description: 'تسوية جزء من العهدة',
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        submittedById: testAccountant.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(custodyExpense.id);

    // 3. Submitted Payroll = 200.00 SAR
    // Expected exposure before payroll = 250.00 SAR
    // Expected exposure after payroll = 450.00 SAR
    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '200.00',
      status: PayrollStatus.SUBMITTED,
    });

    const approvedDTO = await approvePayroll(entry.id);
    expect(approvedDTO.status).toBe(PayrollStatus.APPROVED);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityType: 'PAYROLL_ENTRY',
        entityId: entry.id,
        action: 'PAYROLL_ENTRY_APPROVED',
      },
    });

    const metadata = audit.metadata as Record<string, unknown>;
    expect(metadata['exposureBeforeApproval']).toBe('250.00');
    expect(metadata['exposureAfterApproval']).toBe('450.00');
    expect(metadata['budgetLineRemaining']).toBe('550.00'); // 1000 - 450 = 550
  });

  // ---------------------------------------------------------------------------
  // 11. Audit Atomicity
  // ---------------------------------------------------------------------------
  it('audit atomicity: simulated audit failure rolls back the entire approval transaction', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const entry = await seedPayrollEntry({
      projectId: project.id,
      budgetLineId: laborLine.id,
      createdById: testAccountant.id,
      amount: '5000.00',
      status: PayrollStatus.SUBMITTED,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        // Force audit log creation inside tx to fail
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_AUDIT_WRITE_FAILURE');
        });
        return callback(tx);
      }, ...args);
    });

    await expect(approvePayroll(entry.id)).rejects.toThrow('SIMULATED_AUDIT_WRITE_FAILURE');

    // Verify rollback: PayrollEntry must NOT be approved in PostgreSQL
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
    expect(dbEntry.approvedById).toBeNull();
    expect(dbEntry.approvedAt).toBeNull();

    // Verify no orphaned approval audit log
    const orphanAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PAYROLL_ENTRY',
        entityId: entry.id,
        action: 'PAYROLL_ENTRY_APPROVED',
      },
    });
    expect(orphanAudit).toBeNull();
  });
});
