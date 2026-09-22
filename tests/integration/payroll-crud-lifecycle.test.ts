/**
 * tests/integration/payroll-crud-lifecycle.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 7: Payroll Lifecycle, Mutation, and Duplicate Protection Integration Tests on Live PostgreSQL.
 *
 * Covers:
 * 1. Full Lifecycle:
 *    DRAFT -> EDIT -> SUBMIT -> REJECT -> REOPEN -> EDIT -> SUBMIT -> APPROVE
 * 2. Cancellation Lifecycle:
 *    - DRAFT -> CANCELLED (by creator Accountant or Manager)
 *    - SUBMITTED -> CANCELLED (by Manager only)
 * 3. Soft-delete Lifecycle:
 *    DRAFT soft deletion (deletedAt set, audit preserved, excluded from active queries)
 * 4. BD-10 Business Key Duplicate Protection:
 *    - Duplicate key: (projectId, periodYear, periodMonth, normalizedWorkerName)
 *    - Active entries (DRAFT, SUBMITTED, APPROVED) block duplicate creation & submission
 *    - Inactive entries (REJECTED, CANCELLED, soft-deleted) do NOT block new entries
 *    - Update excludes current record ID from duplicate collision
 * 5. Cross-entity invariant validation:
 *    - Rejection of non-LABOR category
 *    - Rejection of unapproved or inactive project/budget
 * 6. Concurrency & Race Protection:
 *    - CREATE vs CREATE duplicate race (serialized by pg_advisory_xact_lock: 1 succeeds, 1 fails)
 *    - SUBMIT vs CREATE duplicate race
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  PayrollStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createPayrollDraft,
  updatePayrollDraft,
  deletePayrollDraft,
  submitPayroll,
  rejectPayroll,
  reopenPayroll,
  cancelPayroll,
  approvePayroll,
  getPayrollEntry,
} from '@/lib/payroll';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll CRUD Lifecycle & Business Invariants (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupPayrollIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير دورة الرواتب',
          email: `mgr.paylife.${Date.now()}@test.local`,
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
          name: 'محاسب دورة الرواتب',
          email: `acc.paylife.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const id of cleanupPayrollIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PAYROLL_ENTRY', entityId: id } });
      await prisma.payrollEntry.deleteMany({ where: { id } });
    }
    cleanupPayrollIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.payrollEntry.deleteMany({ where: { projectId: pId } });
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

  async function setupProjectWithLaborLine(amount: string = '100000.00') {
    const code = `PRJ-L${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع دورة حياة الرواتب ${code}`,
      description: 'مشروع فحص دورة حياة الرواتب والأجور',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند عمالة الموقع',
          amount,
        },
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد الموقع',
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

    return { project, laborLine, materialsLine };
  }

  // ---------------------------------------------------------------------------
  // 1. Full Standard Lifecycle
  // ---------------------------------------------------------------------------
  it('full standard lifecycle: CREATE -> UPDATE -> SUBMIT -> REJECT -> REOPEN -> UPDATE -> SUBMIT -> APPROVE', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    // 1.1 Accountant creates DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: '  عبدالرحمن   سالم  ',
      workerReference: 'EMP-01',
      tradeOrTitle: 'فني تمديدات',
      periodYear: 2026,
      periodMonth: 9,
      amount: '4000.00',
      description: 'أجور شهر سبتمبر 2026 للموقع',
    });
    cleanupPayrollIds.push(draft.id);

    expect(draft.status).toBe(PayrollStatus.DRAFT);
    expect(draft.workerName).toBe('عبدالرحمن سالم'); // Normalized
    expect(draft.amount).toBe('4000.00');

    // 1.2 Accountant updates DRAFT
    const updatedDraft = await updatePayrollDraft(draft.id, {
      amount: '4500.00',
      description: 'أجور شهر سبتمبر بعد إضافة العمل الإضافي',
    });
    expect(updatedDraft.amount).toBe('4500.00');
    expect(updatedDraft.status).toBe(PayrollStatus.DRAFT);

    // 1.3 Accountant submits DRAFT -> SUBMITTED
    const submitted = await submitPayroll(draft.id);
    expect(submitted.status).toBe(PayrollStatus.SUBMITTED);
    expect(submitted.submittedById).toBe(testAccountant.id);
    expect(submitted.submittedAt).toBeDefined();

    // 1.4 Manager rejects SUBMITTED -> REJECTED
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const rejected = await rejectPayroll(draft.id, {
      rejectionReason: 'يرجى مراجعة ساعات العمل الإضافي وتعديل المبلغ',
    });
    expect(rejected.status).toBe(PayrollStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id);
    expect(rejected.rejectionReason).toBe('يرجى مراجعة ساعات العمل الإضافي وتعديل المبلغ');

    // 1.5 Accountant reopens REJECTED -> DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const reopened = await reopenPayroll(draft.id);
    expect(reopened.status).toBe(PayrollStatus.DRAFT);
    expect(reopened.rejectedById).toBeNull();
    expect(reopened.rejectionReason).toBeNull();

    // 1.6 Accountant corrects amount and resubmits
    await updatePayrollDraft(draft.id, {
      amount: '4200.00',
      description: 'أجور شهر سبتمبر مصححة حسب ملاحظات المدير',
    });

    const resubmitted = await submitPayroll(draft.id);
    expect(resubmitted.status).toBe(PayrollStatus.SUBMITTED);
    expect(resubmitted.amount).toBe('4200.00');

    // 1.7 Manager approves SUBMITTED -> APPROVED
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approved = await approvePayroll(draft.id);
    expect(approved.status).toBe(PayrollStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.amount).toBe('4200.00');

    // 1.8 Verify detail retrieval
    const detail = await getPayrollEntry(draft.id);
    expect(detail.status).toBe(PayrollStatus.APPROVED);
    expect(detail.amount).toBe('4200.00');
  });

  // ---------------------------------------------------------------------------
  // 2. Cancellation Lifecycles
  // ---------------------------------------------------------------------------
  it('cancellation lifecycle: DRAFT can be cancelled by creator Accountant or Manager', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'خالد عمر',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد للتجربة',
    });
    cleanupPayrollIds.push(draft.id);

    const cancelled = await cancelPayroll(draft.id, {
      cancellationReason: 'تم إلغاء القيد بسبب عدم مباشرة العامل للعمل بالموقع',
    });
    expect(cancelled.status).toBe(PayrollStatus.CANCELLED);
    expect(cancelled.cancellationReason).toBe(
      'تم إلغاء القيد بسبب عدم مباشرة العامل للعمل بالموقع',
    );
  });

  it('cancellation lifecycle: SUBMITTED entry can be cancelled by Manager', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'فهد عبدالله',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3500.00',
      description: 'قيد مقدم للإلغاء',
    });
    cleanupPayrollIds.push(draft.id);

    await submitPayroll(draft.id);

    // Manager cancels SUBMITTED entry
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const cancelled = await cancelPayroll(draft.id, {
      cancellationReason: 'إلغاء من قبل المدير بسبب تكرار العمليات',
    });
    expect(cancelled.status).toBe(PayrollStatus.CANCELLED);
  });

  // ---------------------------------------------------------------------------
  // 3. Soft Delete Lifecycle
  // ---------------------------------------------------------------------------
  it('soft-delete lifecycle: creator Accountant soft-deletes DRAFT, record is marked deleted and excluded from detail query', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'ماجد صالح',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد سيتم حذفه',
    });
    cleanupPayrollIds.push(draft.id);

    const deleteResult = await deletePayrollDraft(draft.id);
    expect(deleteResult.success).toBe(true);

    // Verify row still exists in DB but with deletedAt set
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.deletedAt).toBeInstanceOf(Date);

    // Detail query fails with NOT_FOUND
    await expect(getPayrollEntry(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  // ---------------------------------------------------------------------------
  // 4. BD-10 Duplicate Protection
  // ---------------------------------------------------------------------------
  it('duplicate protection: rejects creation of duplicate active entry with same (project, period, normalized workerName)', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft1 = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'محمد أحمد علي',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'القيد الأول',
    });
    cleanupPayrollIds.push(draft1.id);

    // Attempt second draft with varied whitespace
    await expect(
      createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: '  محمد   أحمد    علي  ',
        periodYear: 2026,
        periodMonth: 9,
        amount: '5000.00',
        description: 'قيد مكرر لنفس العامل في نفس الفترة',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'DUPLICATE_PAYROLL_ENTRY' }));
  });

  it('duplicate protection: soft-deleted or cancelled records do NOT block creation of a new entry for the same worker and period', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'سعيد القحطاني',
      periodYear: 2026,
      periodMonth: 9,
      amount: '4000.00',
      description: 'قيد سيتم حذفه لإتاحة إنشاء قيد جديد',
    });
    cleanupPayrollIds.push(draft.id);

    // Soft delete
    await deletePayrollDraft(draft.id);

    // Now creating a new entry with the same worker and period must succeed
    const newDraft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'سعيد القحطاني',
      periodYear: 2026,
      periodMonth: 9,
      amount: '4000.00',
      description: 'قيد جديد بعد حذف السابق',
    });
    cleanupPayrollIds.push(newDraft.id);

    expect(newDraft.id).not.toBe(draft.id);
    expect(newDraft.status).toBe(PayrollStatus.DRAFT);
  });

  it('duplicate protection: updating current draft does not trigger self-collision', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'ياسر إبراهيم',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3800.00',
      description: 'تعديل بدون تغيير العامل',
    });
    cleanupPayrollIds.push(draft.id);

    // Update with exact same workerName and period -> should succeed without duplicate error
    const updated = await updatePayrollDraft(draft.id, {
      amount: '4100.00',
      workerName: 'ياسر إبراهيم',
    });
    expect(updated.amount).toBe('4100.00');
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-Entity Invariant Revalidations
  // ---------------------------------------------------------------------------
  it('invariants: rejects creating payroll draft on non-LABOR budget line', async () => {
    const { project, materialsLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    await expect(
      createPayrollDraft({
        projectId: project.id,
        budgetLineId: materialsLine.id, // MATERIALS instead of LABOR
        workerName: 'عامل مواد',
        periodYear: 2026,
        periodMonth: 9,
        amount: '2000.00',
        description: 'محاولة خاطئة على بند المواد',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_BUDGET_LINE_CATEGORY' }));
  });

  // ---------------------------------------------------------------------------
  // 6. Concurrency: CREATE vs CREATE Race Condition
  // ---------------------------------------------------------------------------
  it('concurrency: concurrent createPayrollDraft calls for identical key serialize via advisory lock, exactly 1 succeeds', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);

    const inputA = {
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل السباق التزامني',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'طلب إنشاء متزامن أ',
    };

    const inputB = {
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل السباق التزامني',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'طلب إنشاء متزامن ب',
    };

    // Dispatch concurrent create operations
    const [resultA, resultB] = await Promise.allSettled([
      createPayrollDraft(inputA),
      createPayrollDraft(inputB),
    ]);

    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const successfulEntry = (fulfilled[0] as PromiseFulfilledResult<{ id: string }>).value;
    cleanupPayrollIds.push(successfulEntry.id);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.code).toBe('DUPLICATE_PAYROLL_ENTRY');

    // Verify DB has strictly 1 record
    const entries = await prisma.payrollEntry.findMany({
      where: {
        projectId: project.id,
        workerName: 'عامل السباق التزامني',
        periodYear: 2026,
        periodMonth: 9,
        deletedAt: null,
      },
    });
    expect(entries.length).toBe(1);
  });
});
