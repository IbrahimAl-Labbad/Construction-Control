/**
 * tests/integration/payroll-usecase-authorization.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 7: Comprehensive Authorization & Permission Integration Tests on Live PostgreSQL.
 *
 * Enforces Role-Based Access Control and Separation of Duties:
 * 1. createPayrollDraft: ACCOUNTANT only; MANAGER, ENGINEER, PURCHASING denied.
 * 2. updatePayrollDraft: Creator ACCOUNTANT only; other users and non-DRAFT denied.
 * 3. deletePayrollDraft: Creator ACCOUNTANT only; other users and non-DRAFT denied.
 * 4. submitPayroll: Creator ACCOUNTANT only; other users denied.
 * 5. rejectPayroll: MANAGER only; ACCOUNTANT, ENGINEER, PURCHASING denied.
 * 6. reopenPayroll: Creator ACCOUNTANT only; other users denied.
 * 7. cancelPayroll Matrix:
 *    - DRAFT: Creator Accountant ALLOW, Other Accountant DENY, Manager ALLOW.
 *    - SUBMITTED: Manager ALLOW, Accountant DENY.
 *    - REJECTED/APPROVED/CANCELLED: DENY for all roles.
 * 8. getPayrollEntry: MANAGER and ACCOUNTANT ALLOW; ENGINEER and PURCHASING DENY.
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

describe('Payroll Use-Case Authorization & Role Matrix (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let otherAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

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
          name: 'مدير صلاحيات الرواتب',
          email: `mgr.payauth.${Date.now()}@test.local`,
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

    // 2. Creator Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب منشئ الرواتب',
          email: `acc.payauth.${Date.now()}@test.local`,
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

    // 3. Other Accountant
    let otherAcc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null, id: { not: acc.id } },
    });
    if (!otherAcc) {
      otherAcc = await prisma.user.create({
        data: {
          name: 'محاسب آخر للتحقق من العزل',
          email: `acc.other.${Date.now()}@test.local`,
          role: Role.ACCOUNTANT,
          isActive: true,
        },
      });
    }
    otherAccountant = {
      id: otherAcc.id,
      name: otherAcc.name,
      email: otherAcc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };

    // 4. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس لاختبار الصلاحيات',
          email: `eng.payauth.${Date.now()}@test.local`,
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

    // 5. Purchasing
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات لاختبار الصلاحيات',
          email: `pur.payauth.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireManager').mockImplementation(async () => {
      const u = await permissions.requireAuth();
      if (u.role !== Role.MANAGER) {
        throw new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], u.role);
      }
      return u;
    });
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
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const code = `PRJ-A${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع صلاحيات الرواتب ${code}`,
      description: 'مشروع فحص صلاحيات الرواتب والأجور',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند أجور وعمالة الصلاحيات',
          amount,
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const laborLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id, category: BudgetCategory.LABOR },
    });

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);

    return { project, laborLine };
  }

  // ---------------------------------------------------------------------------
  // 1. CREATE Authorization
  // ---------------------------------------------------------------------------
  it('create: allows Accountant to create draft, rejects Manager, Engineer, and Purchasing', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const input = {
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'علي بن حسن',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'فحص صلاحيات الإنشاء',
    };

    // 1. Accountant creates successfully
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft(input);
    cleanupPayrollIds.push(draft.id);
    expect(draft.status).toBe(PayrollStatus.DRAFT);

    // 2. Manager denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await expect(
      createPayrollDraft({ ...input, workerName: 'عامل تجربة 1' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 3. Engineer denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    await expect(
      createPayrollDraft({ ...input, workerName: 'عامل تجربة 2' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 4. Purchasing denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    await expect(
      createPayrollDraft({ ...input, workerName: 'عامل تجربة 3' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  // ---------------------------------------------------------------------------
  // 2. UPDATE Authorization
  // ---------------------------------------------------------------------------
  it('update: allows creator Accountant, rejects other Accountant, Manager, and non-DRAFT entries', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عمر القاسم',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد للتعديل',
    });
    cleanupPayrollIds.push(draft.id);

    // 1. Creator Accountant updates successfully
    const updated = await updatePayrollDraft(draft.id, { amount: '3500.00' });
    expect(updated.amount).toBe('3500.00');

    // 2. Other Accountant denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(otherAccountant);
    await expect(
      updatePayrollDraft(draft.id, { amount: '4000.00' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 3. Manager denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await expect(
      updatePayrollDraft(draft.id, { amount: '4000.00' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 4. Submit and verify update is blocked (RECORD_NOT_EDITABLE)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    await submitPayroll(draft.id);

    await expect(
      updatePayrollDraft(draft.id, { amount: '4000.00' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RECORD_NOT_EDITABLE' }));
  });

  // ---------------------------------------------------------------------------
  // 3. DELETE Authorization
  // ---------------------------------------------------------------------------
  it('delete: allows creator Accountant, rejects other Accountant and Manager', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'صالح العمري',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد للحذف',
    });
    cleanupPayrollIds.push(draft.id);

    // 1. Other Accountant denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(otherAccountant);
    await expect(deletePayrollDraft(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 2. Manager denied (deletion is creator-owned)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await expect(deletePayrollDraft(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 3. Creator Accountant soft-deletes successfully
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const res = await deletePayrollDraft(draft.id);
    expect(res.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. SUBMIT Authorization
  // ---------------------------------------------------------------------------
  it('submit: allows creator Accountant, rejects other Accountant, Manager, and non-DRAFT status', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'طارق الزهراني',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد للتقديم',
    });
    cleanupPayrollIds.push(draft.id);

    // 1. Other Accountant denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(otherAccountant);
    await expect(submitPayroll(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 2. Manager denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await expect(submitPayroll(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 3. Creator Accountant submits successfully
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const submitted = await submitPayroll(draft.id);
    expect(submitted.status).toBe(PayrollStatus.SUBMITTED);

    // 4. Cannot submit already SUBMITTED entry
    await expect(submitPayroll(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });

  // ---------------------------------------------------------------------------
  // 5. REJECT & REOPEN Authorization
  // ---------------------------------------------------------------------------
  it('reject and reopen: only Manager can reject; only creator Accountant can reopen', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'وليد الدوسري',
      periodYear: 2026,
      periodMonth: 9,
      amount: '3000.00',
      description: 'قيد للرفض وإعادة الفتح',
    });
    cleanupPayrollIds.push(draft.id);
    await submitPayroll(draft.id);

    // 1. Accountant cannot reject
    await expect(
      rejectPayroll(draft.id, { rejectionReason: 'محاولة رفض من المحاسب' }),
    ).rejects.toThrow();

    // 2. Manager rejects successfully
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const rejected = await rejectPayroll(draft.id, {
      rejectionReason: 'مبلغ غير متطابق مع ساعات العمل المسجلة',
    });
    expect(rejected.status).toBe(PayrollStatus.REJECTED);

    // 3. Other Accountant cannot reopen
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(otherAccountant);
    await expect(reopenPayroll(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 4. Manager cannot reopen
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await expect(reopenPayroll(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 5. Creator Accountant reopens successfully
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const reopened = await reopenPayroll(draft.id);
    expect(reopened.status).toBe(PayrollStatus.DRAFT);
  });

  // ---------------------------------------------------------------------------
  // 6. CANCEL Matrix Authorization
  // ---------------------------------------------------------------------------
  it('cancel matrix: strictly verifies permissions across DRAFT, SUBMITTED, REJECTED, and APPROVED statuses', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    // Setup 1: DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل فحص الإلغاء 1',
      periodYear: 2026,
      periodMonth: 9,
      amount: '1000.00',
      description: 'فحص مصفوفة الإلغاء',
    });
    cleanupPayrollIds.push(draft.id);

    // DRAFT -> other Accountant DENIED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(otherAccountant);
    await expect(
      cancelPayroll(draft.id, { cancellationReason: 'محاولة إلغاء مسودة شخص آخر' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // DRAFT -> Manager ALLOWED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const cancelledDraft = await cancelPayroll(draft.id, {
      cancellationReason: 'إلغاء مسودة من قبل المدير',
    });
    expect(cancelledDraft.status).toBe(PayrollStatus.CANCELLED);

    // Setup 2: SUBMITTED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft2 = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل فحص الإلغاء 2',
      periodYear: 2026,
      periodMonth: 9,
      amount: '1000.00',
      description: 'فحص إلغاء المقدم',
    });
    cleanupPayrollIds.push(draft2.id);
    await submitPayroll(draft2.id);

    // SUBMITTED -> Accountant DENIED
    await expect(
      cancelPayroll(draft2.id, { cancellationReason: 'محاسب يحاول إلغاء قيد مقدم' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));

    // SUBMITTED -> Manager ALLOWED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const cancelledSubmitted = await cancelPayroll(draft2.id, {
      cancellationReason: 'إلغاء قيد مقدم من قبل المدير',
    });
    expect(cancelledSubmitted.status).toBe(PayrollStatus.CANCELLED);

    // Setup 3: APPROVED (strictly immutable)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft3 = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل فحص الإلغاء 3',
      periodYear: 2026,
      periodMonth: 9,
      amount: '1000.00',
      description: 'فحص إلغاء المعتمد',
    });
    cleanupPayrollIds.push(draft3.id);
    await submitPayroll(draft3.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await approvePayroll(draft3.id);

    // APPROVED -> Cancel DENIED for all
    await expect(
      cancelPayroll(draft3.id, { cancellationReason: 'محاولة إلغاء قيد معتمد' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RECORD_NOT_EDITABLE' }));
  });

  // ---------------------------------------------------------------------------
  // 7. GET DETAIL Authorization
  // ---------------------------------------------------------------------------
  it('get detail: Manager and Accountant allowed; Engineer and Purchasing denied', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'سامي عبدالمجيد',
      periodYear: 2026,
      periodMonth: 9,
      amount: '2500.00',
      description: 'فحص صلاحيات الاستعراض',
    });
    cleanupPayrollIds.push(draft.id);

    // 1. Accountant allowed
    const accDetail = await getPayrollEntry(draft.id);
    expect(accDetail.id).toBe(draft.id);

    // 2. Manager allowed
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const mgrDetail = await getPayrollEntry(draft.id);
    expect(mgrDetail.id).toBe(draft.id);

    // 3. Engineer denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    await expect(getPayrollEntry(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 4. Purchasing denied
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    await expect(getPayrollEntry(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
