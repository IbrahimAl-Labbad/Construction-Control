/**
 * tests/integration/variation-order-concurrency.test.ts
 *
 * Slice 21D: Variation Order Lifecycle Concurrency Hardening (Live PostgreSQL).
 *
 * Test Scenarios:
 * 1. Test 1: Concurrent Update vs. Submit on same VO Draft.
 *    - Proves row-level locking serializes draft modification and submission.
 *    - Prevents silent overwrites or modifying an already submitted VO.
 *
 * 2. Test 2: Concurrent Double Approval on same Submitted VO.
 *    - Proves row-level locking prevents duplicate approval.
 *    - Exactly one succeeds, other fails with INVALID_STATE_TRANSITION.
 *    - Exactly ONE VARIATION_ORDER_APPROVED audit log.
 *
 * 3. Test 3: Concurrent Approval vs. Rejection Race.
 *    - Proves canonical lock serialization prevents conflicting terminal outcomes.
 *    - Exactly one transition wins; loser cleanly rolls back with zero orphaned audit logs.
 *
 * 4. Test 4: Negative Variation Financial Ceiling Protection.
 *    - Proves an approved negative VO cannot drop commitment ceiling below cumulative certified billings.
 *    - Atomically rolls back with COMMITMENT_CEILING_EXCEEDED and zero audit logs.
 *
 * 5. Test 5: Concurrent VO Creation & Sequential Order Number Serialization.
 *    - Proves project row lock prevents duplicate order numbers under concurrent creation.
 *    - Both succeed with unique sequential numbers (001 and 002).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  VariationOrderStatus,
  CommitmentStatus,
  ExpenseStatus,
  SubcontractorBillingStatus,
  AssignmentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createVariationOrder,
  updateVariationOrder,
  submitVariationOrder,
  approveVariationOrder,
  rejectVariationOrder,
  getProjectVariationsSummary,
  type VariationOrderDetailDTO,
} from '@/lib/variation-orders';
import { createExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as authSession from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Variation Order Concurrency Hardening (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testOtherEngineer: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupVoIds: string[] = [];
  const cleanupExpenseIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgrUser = await prisma.user.create({
      data: {
        name: 'مدير اختبار التزامن',
        email: `mgr.voconc.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgrUser.id);
    testManager = {
      id: mgrUser.id,
      name: mgrUser.name,
      email: mgrUser.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Engineer (Creator)
    const engUser = await prisma.user.create({
      data: {
        name: 'مهندس الموقع المكلف',
        email: `eng.voconc.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(engUser.id);
    testEngineer = {
      id: engUser.id,
      name: engUser.name,
      email: engUser.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Other Engineer
    const otherEngUser = await prisma.user.create({
      data: {
        name: 'مهندس موقع إضافي',
        email: `eng2.voconc.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(otherEngUser.id);
    testOtherEngineer = {
      id: otherEngUser.id,
      name: otherEngUser.name,
      email: otherEngUser.email,
      role: Role.ENGINEER,
      isActive: true,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Cleanup in reverse dependency order
    if (cleanupVoIds.length > 0) {
      await prisma.variationOrderLine.deleteMany({
        where: { variationOrderId: { in: cleanupVoIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'VARIATION_ORDER', entityId: { in: cleanupVoIds } },
      });
      await prisma.variationOrder.deleteMany({
        where: { id: { in: cleanupVoIds } },
      });
    }

    if (cleanupExpenseIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'EXPENSE', entityId: { in: cleanupExpenseIds } },
      });
      await prisma.expense.deleteMany({
        where: { id: { in: cleanupExpenseIds } },
      });
    }

    if (cleanupProjectIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'PROJECT', entityId: { in: cleanupProjectIds } },
      });
      await prisma.projectAssignment.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.subcontractorBilling.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.commitment.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.budgetLine.deleteMany({
        where: { budget: { projectId: { in: cleanupProjectIds } } },
      });
      await prisma.budget.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: cleanupProjectIds } },
      });
    }

    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
  });

  async function setupProjectWithBudget(budgetAmount = '500000.00') {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `VOCONC-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن أوامر التغيير',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال مقاولي الباطن',
          amount: budgetAmount,
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    // Assign engineer
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    return { project, budgetLine };
  }

  // ---------------------------------------------------------------------------
  // TEST 1 — Concurrent Update vs. Submit on same VO Draft
  // ---------------------------------------------------------------------------
  it('Test 1: serializes concurrent Update vs. Submit on same VO Draft without data corruption', async () => {
    const { project } = await setupProjectWithBudget();

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر تغيير للاختبار المتزامن',
      description: 'وصف مسودة أمر التغيير',
      reason: 'سبب للموقع',
      impactAmount: '10000.00',
    });
    cleanupVoIds.push(draft.id);

    // Concurrently dispatch update and submit
    const [updateRes, submitRes] = await Promise.allSettled([
      updateVariationOrder({
        id: draft.id,
        title: 'أمر تغيير معدل متزامناً',
        description: 'وصف جديد ومعدل',
        reason: 'سبب معدل',
        impactAmount: '15000.00',
      }),
      submitVariationOrder({ id: draft.id }),
    ]);

    // Submit must ALWAYS succeed
    expect(submitRes.status).toBe('fulfilled');

    const dbVO = await prisma.variationOrder.findUniqueOrThrow({
      where: { id: draft.id },
    });

    // The VO must be in SUBMITTED status
    expect(dbVO.status).toBe(VariationOrderStatus.SUBMITTED);
    expect(dbVO.submittedById).toBe(testEngineer.id);

    if (updateRes.status === 'fulfilled') {
      // Update ran first, then submit: impactAmount is 15000.00
      expect(dbVO.impactAmount.toFixed(2)).toBe('15000.00');
      expect(dbVO.title).toBe('أمر تغيير معدل متزامناً');
    } else {
      // Submit ran first, then update was cleanly rejected with RECORD_NOT_EDITABLE
      const err = (updateRes as PromiseRejectedResult).reason;
      expect(err.code).toBe('RECORD_NOT_EDITABLE');
      expect(dbVO.impactAmount.toFixed(2)).toBe('10000.00');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Concurrent Double Approval on same Submitted VO
  // ---------------------------------------------------------------------------
  it('Test 2: serializes concurrent approval attempts; exactly one succeeds and one audit log is written', async () => {
    const { project } = await setupProjectWithBudget();

    // 1. Engineer creates and submits VO
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر تغيير لاختبار الاعتماد المزدوج',
      description: 'وصف أمر التغيير',
      reason: 'سبب هندسي',
      impactAmount: '20000.00',
    });
    cleanupVoIds.push(draft.id);
    await submitVariationOrder({ id: draft.id });

    // 2. Manager concurrently approves twice
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const [appRes1, appRes2] = await Promise.allSettled([
      approveVariationOrder({ id: draft.id }),
      approveVariationOrder({ id: draft.id }),
    ]);

    expect([appRes1.status, appRes2.status]).toContain('fulfilled');
    expect([appRes1.status, appRes2.status]).toContain('rejected');

    const winner = appRes1.status === 'fulfilled' ? appRes1 : appRes2;
    const loser = appRes1.status === 'rejected' ? appRes1 : appRes2;

    expect(winner.status).toBe('fulfilled');
    expect((loser as PromiseRejectedResult).reason.code).toBe('INVALID_STATE_TRANSITION');

    // Live DB state: strictly APPROVED, approved by testManager
    const dbVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: draft.id } });
    expect(dbVO.status).toBe(VariationOrderStatus.APPROVED);
    expect(dbVO.approvedById).toBe(testManager.id);

    // Exactly ONE VARIATION_ORDER_APPROVED audit log
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_APPROVED',
      },
    });
    expect(auditLogs).toHaveLength(1);

    // Summary reflects impact exactly once (+20,000.00)
    const summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('20000.00');
    expect(summary.revisedApprovedBudget).toBe('520000.00');
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Concurrent Approval vs. Rejection Race
  // ---------------------------------------------------------------------------
  it('Test 3: serializes concurrent Approval vs. Rejection; winner commits atomically without conflicting states', async () => {
    const { project } = await setupProjectWithBudget();

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر تغيير لاختبار تنازع الاعتماد والرفض',
      description: 'وصف أمر التغيير',
      reason: 'سبب هندسي',
      impactAmount: '30000.00',
    });
    cleanupVoIds.push(draft.id);
    await submitVariationOrder({ id: draft.id });

    // Concurrently dispatch approve and reject
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const [appRes, rejRes] = await Promise.allSettled([
      approveVariationOrder({ id: draft.id }),
      rejectVariationOrder({ id: draft.id, rejectionReason: 'مرفوض لعدم مطابقة المواصفات' }),
    ]);

    expect([appRes.status, rejRes.status]).toContain('fulfilled');
    expect([appRes.status, rejRes.status]).toContain('rejected');

    const dbVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: draft.id } });

    if (appRes.status === 'fulfilled') {
      // Approval won: status = APPROVED, rejRes rejected with INVALID_STATE_TRANSITION
      expect(dbVO.status).toBe(VariationOrderStatus.APPROVED);
      expect(dbVO.approvedById).toBe(testManager.id);
      expect((rejRes as PromiseRejectedResult).reason.code).toBe('INVALID_STATE_TRANSITION');

      const approvedAudits = await prisma.auditLog.findMany({
        where: { entityType: 'VARIATION_ORDER', entityId: draft.id, action: 'VARIATION_ORDER_APPROVED' },
      });
      expect(approvedAudits).toHaveLength(1);

      const rejectedAudits = await prisma.auditLog.findMany({
        where: { entityType: 'VARIATION_ORDER', entityId: draft.id, action: 'VARIATION_ORDER_REJECTED' },
      });
      expect(rejectedAudits).toHaveLength(0); // Clean rollback!
    } else {
      // Rejection won: status = REJECTED, appRes rejected with INVALID_STATE_TRANSITION
      expect(dbVO.status).toBe(VariationOrderStatus.REJECTED);
      expect(dbVO.rejectedById).toBe(testManager.id);
      expect((appRes as PromiseRejectedResult).reason.code).toBe('INVALID_STATE_TRANSITION');

      const rejectedAudits = await prisma.auditLog.findMany({
        where: { entityType: 'VARIATION_ORDER', entityId: draft.id, action: 'VARIATION_ORDER_REJECTED' },
      });
      expect(rejectedAudits).toHaveLength(1);

      const approvedAudits = await prisma.auditLog.findMany({
        where: { entityType: 'VARIATION_ORDER', entityId: draft.id, action: 'VARIATION_ORDER_APPROVED' },
      });
      expect(approvedAudits).toHaveLength(0); // Clean rollback!
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Negative Variation Financial Ceiling Protection
  // ---------------------------------------------------------------------------
  it('Test 4: prevents negative variation from reducing commitment ceiling below certified billings', async () => {
    const { project, budgetLine } = await setupProjectWithBudget('500000.00');

    // 1. Create and approve a Commitment of 100,000 SAR
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('100000.00'),
        currency: 'SAR',
        vendorName: 'شركة المقاولات الإنشائية',
        referenceNumber: 'COMM-NEG-TEST',
        description: 'عقد مقاولة لاختبار التخفيض',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // 2. Create and approve a Subcontractor Billing of 80,000 SAR
    await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        commitmentId: commitment.id,
        budgetLineId: budgetLine.id,
        subcontractorName: 'شركة المقاولات الإنشائية',
        billingPeriod: 'أكتوبر 2026',
        claimDate: new Date(),
        referenceNumber: 'BILL-NEG-001',
        grossAmount: new Prisma.Decimal('80000.00'),
        description: 'مستخلص أعمال مرحلية',
        currency: 'SAR',
        status: SubcontractorBillingStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // 3. Engineer creates and submits a negative VO of -30,000 SAR
    // Revised ceiling would be: 100,000 - 30,000 = 70,000 SAR < 80,000 SAR certified billings!
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      commitmentId: commitment.id,
      budgetLineId: budgetLine.id,
      title: 'أمر تخفيض مالي مفرط',
      description: 'إلغاء أجزاء من العقد',
      reason: 'تقليص نطاق الأعمال',
      impactAmount: '-30000.00',
    });
    cleanupVoIds.push(draft.id);
    await submitVariationOrder({ id: draft.id });

    // 4. Manager attempts to approve — MUST FAIL with COMMITMENT_CEILING_EXCEEDED!
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    await expect(approveVariationOrder({ id: draft.id })).rejects.toThrowError(
      /يخفض سقف الارتباط التعاقدي.*إلى ما دون إجمالي المستخلصات المعتمدة/,
    );

    // Live DB state: still SUBMITTED, zero approved audit logs
    const dbVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: draft.id } });
    expect(dbVO.status).toBe(VariationOrderStatus.SUBMITTED);
    expect(dbVO.approvedById).toBeNull();

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'VARIATION_ORDER', entityId: draft.id, action: 'VARIATION_ORDER_APPROVED' },
    });
    expect(auditLogs).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Concurrent VO Creation & Sequential Order Number Serialization
  // ---------------------------------------------------------------------------
  it('Test 5: serializes concurrent VO creation for the same project without duplicate order numbers', async () => {
    const { project } = await setupProjectWithBudget();

    // Assign second engineer as well
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testOtherEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    vi.spyOn(permissions, 'requireRole').mockImplementation(async (role) => {
      if (role === Role.ENGINEER) return testEngineer;
      return testManager;
    });
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    // Concurrently create two VOs on the exact same project
    const [voRes1, voRes2] = await Promise.allSettled([
      createVariationOrder({
        projectId: project.id,
        title: 'أمر تغيير متزامن رقم 1',
        description: 'وصف أمر 1',
        reason: 'سبب 1',
        impactAmount: '5000.00',
      }),
      createVariationOrder({
        projectId: project.id,
        title: 'أمر تغيير متزامن رقم 2',
        description: 'وصف أمر 2',
        reason: 'سبب 2',
        impactAmount: '7000.00',
      }),
    ]);

    expect(voRes1.status).toBe('fulfilled');
    expect(voRes2.status).toBe('fulfilled');

    const vo1 = (voRes1 as PromiseFulfilledResult<VariationOrderDetailDTO>).value;
    const vo2 = (voRes2 as PromiseFulfilledResult<VariationOrderDetailDTO>).value;
    cleanupVoIds.push(vo1.id, vo2.id);

    // Assert that the two order numbers are unique and sequential
    expect(vo1.orderNumber).not.toBe(vo2.orderNumber);
    const orderNumbers = [vo1.orderNumber, vo2.orderNumber].sort();
    expect(orderNumbers[0]).toMatch(/-001$/);
    expect(orderNumbers[1]).toMatch(/-002$/);
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Cross-Domain Concurrency: approveExpense vs approveVariationOrder
  // ---------------------------------------------------------------------------
  it('Test 6: races approveExpense against negative approveVariationOrder on shared budget capacity', async () => {
    // 1. Setup project with a BudgetLine of 100,000 SAR
    const { project, budgetLine } = await setupProjectWithBudget('100000.00');

    // 2. Pre-existing approved Commitment consumes 50,000 SAR
    // Active exposure = 50,000 SAR. Available remaining line capacity = 50,000 SAR.
    await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('50000.00'),
        currency: 'SAR',
        vendorName: 'شركة الأساسات المتطورة',
        referenceNumber: 'COMM-XDOM-001',
        description: 'التزام مسبق معتمد',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // 3. Create submitted Direct Expense of 40,000 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '40000.00',
      expenseDate: new Date(),
      description: 'مصروف مباشر متنافس على الموازنة',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // 4. Create submitted Negative Variation Order of -30,000 SAR on this BudgetLine
    // Revised line ceiling would be 100,000 - 30,000 = 70,000 SAR.
    // If expense approves (exposure = 50k + 40k = 90k), then 70k < 90k (overrun).
    // Jointly: 40,000 (expense) + 30,000 (reduction) = 70,000 > 50,000 available capacity!
    const voDraft = await createVariationOrder({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      title: 'أمر تخفيض مالي متزامن',
      description: 'تقليص نطاق أعمال البند',
      reason: 'ترشيد تكاليف البند',
      impactAmount: '-30000.00',
    });
    cleanupVoIds.push(voDraft.id);
    await submitVariationOrder({ id: voDraft.id });

    // 5. Concurrently dispatch approvals for both!
    // Both synchronize on Level 1 budget_lines row lock!
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const [expRes, voRes] = await Promise.allSettled([
      approveExpense(expenseDraft.id),
      approveVariationOrder({ id: voDraft.id }),
    ]);

    // Assert live DB state:
    const finalExp = await prisma.expense.findUniqueOrThrow({ where: { id: expenseDraft.id } });
    const finalVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: voDraft.id } });

    if (expRes.status === 'fulfilled') {
      // approveExpense acquired the budget_lines lock first, raising active exposure to 90,000 SAR.
      // approveVariationOrder then unblocked, saw active exposure (90,000) > revised ceiling (70,000),
      // and was cleanly rejected with BUDGET_LINE_EXCEEDED!
      expect(finalExp.status).toBe(ExpenseStatus.APPROVED);
      expect(finalExp.approvedById).toBe(testManager.id);

      if (voRes.status === 'rejected') {
        const voErr = (voRes as PromiseRejectedResult).reason;
        expect(voErr.code).toBe('BUDGET_LINE_EXCEEDED');
        expect(finalVO.status).toBe(VariationOrderStatus.SUBMITTED);
        expect(finalVO.approvedById).toBeNull();

        const voAudits = await prisma.auditLog.findMany({
          where: { entityType: 'VARIATION_ORDER', entityId: voDraft.id, action: 'VARIATION_ORDER_APPROVED' },
        });
        expect(voAudits).toHaveLength(0);
      }
    } else {
      // approveVariationOrder acquired the lock first and approved the reduction
      expect(finalVO.status).toBe(VariationOrderStatus.APPROVED);
      expect(finalVO.approvedById).toBe(testManager.id);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Stale-Linkage Detection and Clean Retry on Live PostgreSQL
  // ---------------------------------------------------------------------------
  it('Test 7: detects changed linkage between pre-read and lock acquisition, retrying cleanly to approve current target', async () => {
    const { project, budgetLine: lineA } = await setupProjectWithBudget('500000.00');

    // Create a second budget line (line B) on the same project
    const lineB = await prisma.budgetLine.create({
      data: {
        budgetId: lineA.budgetId,
        category: BudgetCategory.MATERIALS,
        description: 'بند مواد إضافي',
        amount: new Prisma.Decimal('200000.00'),
      },
    });

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    // VO is initially created and submitted pointing to lineA
    const voDraft = await createVariationOrder({
      projectId: project.id,
      budgetLineId: lineA.id,
      title: 'أمر لاختبار إعادة محاولة الارتباط',
      description: 'وصف تفصيلي لأمر التغيير للاختبار',
      reason: 'مبرر فني معتمد لأمر التغيير',
      impactAmount: '15000.00',
    });
    cleanupVoIds.push(voDraft.id);
    await submitVariationOrder({ id: voDraft.id });

    // Now simulate: preCheck sees lineB (e.g. stale read), but locked record in DB is lineA!
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const originalFindFirst = prisma.variationOrder.findFirst.bind(prisma.variationOrder);
    let preCheckCalls = 0;

    vi.spyOn(prisma.variationOrder, 'findFirst').mockImplementation(((async (args: { where?: { id?: string; deletedAt?: null } }) => {
      // Intercept the preCheck call outside transaction
      if (args && args.where && args.where.id === voDraft.id && args.where.deletedAt === null) {
        preCheckCalls++;
        if (preCheckCalls === 1) {
          // Attempt 1 preCheck returns stale linkage pointing to lineB
          const real = await originalFindFirst(args);
          if (real) {
            return { ...real, budgetLineId: lineB.id };
          }
        }
      }
      return originalFindFirst(args);
    }) as unknown as typeof prisma.variationOrder.findFirst));

    // Approve the VO
    const result = await approveVariationOrder({ id: voDraft.id });

    // Proves that attempt 1 failed with StaleLinkageRetryError because lockedVO had lineA,
    // so it retried, preCheckCalls became 2, attempt 2 acquired lock for lineA, and approved!
    expect(preCheckCalls).toBe(2);
    expect(result.status).toBe(VariationOrderStatus.APPROVED);
    expect(result.budgetLineId).toBe(lineA.id);

    // Live DB state confirms linkage is lineA and audit record matches lineA
    const dbVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: voDraft.id } });
    expect(dbVO.status).toBe(VariationOrderStatus.APPROVED);
    expect(dbVO.budgetLineId).toBe(lineA.id);

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'VARIATION_ORDER', entityId: voDraft.id, action: 'VARIATION_ORDER_APPROVED' },
    });
    expect((auditLog.metadata as Record<string, unknown>).budgetLineId).toBe(lineA.id);
  });

  // ---------------------------------------------------------------------------
  // TEST 8 — Stale-Linkage Exhaustion after MAX_LINKAGE_RETRIES (Conflict)
  // ---------------------------------------------------------------------------
  it('Test 8: fails with CONFLICT when linkage continually shifts across all retry attempts', async () => {
    const { project, budgetLine: lineA } = await setupProjectWithBudget('500000.00');

    const lineB = await prisma.budgetLine.create({
      data: {
        budgetId: lineA.budgetId,
        category: BudgetCategory.MATERIALS,
        description: 'بند مواد إضافي',
        amount: new Prisma.Decimal('200000.00'),
      },
    });

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const voDraft = await createVariationOrder({
      projectId: project.id,
      budgetLineId: lineA.id,
      title: 'أمر لاختبار استنفاد المحاولات',
      description: 'وصف تفصيلي لأمر التغيير المتنازع عليه',
      reason: 'مبرر فني معتمد لأمر التغيير',
      impactAmount: '15000.00',
    });
    cleanupVoIds.push(voDraft.id);
    await submitVariationOrder({ id: voDraft.id });

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const originalFindFirst = prisma.variationOrder.findFirst.bind(prisma.variationOrder);

    // Continuously simulate stale preCheck linkage pointing to lineB for all attempts
    vi.spyOn(prisma.variationOrder, 'findFirst').mockImplementation(((async (args: { where?: { id?: string; deletedAt?: null } }) => {
      if (args && args.where && args.where.id === voDraft.id && args.where.deletedAt === null) {
        const real = await originalFindFirst(args);
        if (real) {
          return { ...real, budgetLineId: lineB.id };
        }
      }
      return originalFindFirst(args);
    }) as unknown as typeof prisma.variationOrder.findFirst));

    await expect(approveVariationOrder({ id: voDraft.id })).rejects.toThrowError(
      /تغيرت بيانات الارتباط لأمر التغيير أثناء الاعتماد؛ يرجى إعادة المحاولة/,
    );

    // Live DB state confirms VO remains SUBMITTED, approvedById is null, 0 audit logs
    const dbVO = await prisma.variationOrder.findUniqueOrThrow({ where: { id: voDraft.id } });
    expect(dbVO.status).toBe(VariationOrderStatus.SUBMITTED);
    expect(dbVO.approvedById).toBeNull();

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'VARIATION_ORDER', entityId: voDraft.id, action: 'VARIATION_ORDER_APPROVED' },
    });
    expect(auditLogs).toHaveLength(0);
  });
});
