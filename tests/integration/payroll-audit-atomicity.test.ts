/**
 * tests/integration/payroll-audit-atomicity.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 7: Audit Log Atomicity Integration Tests on Live PostgreSQL.
 *
 * Enforces AGENTS.md §21 (Auditability Requirements) & §15 (Database Safety & Transactions):
 * Every mutating use case must prove that database mutations and AuditLog writes
 * succeed together or roll back completely when AuditLog creation fails:
 *
 * 1. createPayrollDraft: simulated audit failure aborts creation (zero rows persisted).
 * 2. updatePayrollDraft: simulated audit failure aborts update (original fields preserved).
 * 3. deletePayrollDraft: simulated audit failure aborts deletion (deletedAt remains null).
 * 4. submitPayroll: simulated audit failure aborts submission (status remains DRAFT).
 * 5. rejectPayroll: simulated audit failure aborts rejection (status remains SUBMITTED).
 * 6. reopenPayroll: simulated audit failure aborts reopen (status remains REJECTED).
 * 7. cancelPayroll: simulated audit failure aborts cancellation (status remains DRAFT).
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
} from '@/lib/payroll';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll Audit Atomicity & Rollback (Live PostgreSQL)', () => {
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
          name: 'مدير ذرية التدقيق للرواتب',
          email: `mgr.payatom.${Date.now()}@test.local`,
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
          name: 'محاسب ذرية التدقيق للرواتب',
          email: `acc.payatom.${Date.now()}@test.local`,
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
    const code = `PRJ-T${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع ذرية الرواتب ${code}`,
      description: 'مشروع فحص ذرية التدقيق للرواتب والأجور',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند أجور وعمالة الذرية',
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

    return { project, laborLine };
  }

  function simulateAuditFailure() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_AUDIT_WRITE_ERROR');
        });
        return callback(tx);
      }, ...args);
    });
  }

  // ---------------------------------------------------------------------------
  // 1. CREATE Atomicity
  // ---------------------------------------------------------------------------
  it('createPayrollDraft: simulated audit failure rolls back record creation', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    simulateAuditFailure();

    await expect(
      createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل اختبار الذرية عند الإنشاء',
        periodYear: 2026,
        periodMonth: 9,
        amount: '5000.00',
        description: 'قيد يفشل بسبب التدقيق',
      }),
    ).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify zero entries exist in database
    const entries = await prisma.payrollEntry.findMany({
      where: { projectId: project.id, workerName: 'عامل اختبار الذرية عند الإنشاء' },
    });
    expect(entries.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 2. UPDATE Atomicity
  // ---------------------------------------------------------------------------
  it('updatePayrollDraft: simulated audit failure rolls back updates', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    // Create draft without mock
    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند التعديل',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'المبلغ الأصلي 5000',
    });
    cleanupPayrollIds.push(draft.id);

    // Now simulate audit failure on update
    simulateAuditFailure();

    await expect(
      updatePayrollDraft(draft.id, {
        amount: '8000.00',
        description: 'محاولة تعديل المبلغ إلى 8000',
      }),
    ).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify database record retains original values
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.amount.toFixed(2)).toBe('5000.00');
    expect(dbEntry.description).toBe('المبلغ الأصلي 5000');
  });

  // ---------------------------------------------------------------------------
  // 3. DELETE Atomicity
  // ---------------------------------------------------------------------------
  it('deletePayrollDraft: simulated audit failure rolls back soft deletion', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند الحذف',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'قيد لاختبار الحذف الذري',
    });
    cleanupPayrollIds.push(draft.id);

    simulateAuditFailure();

    await expect(deletePayrollDraft(draft.id)).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify deletedAt remains null
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.deletedAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 4. SUBMIT Atomicity
  // ---------------------------------------------------------------------------
  it('submitPayroll: simulated audit failure rolls back status transition', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند التقديم',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'قيد لاختبار التقديم الذري',
    });
    cleanupPayrollIds.push(draft.id);

    simulateAuditFailure();

    await expect(submitPayroll(draft.id)).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify status remains DRAFT, submittedById remains null
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.DRAFT);
    expect(dbEntry.submittedById).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 5. REJECT Atomicity
  // ---------------------------------------------------------------------------
  it('rejectPayroll: simulated audit failure rolls back rejection', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند الرفض',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'قيد لاختبار الرفض الذري',
    });
    cleanupPayrollIds.push(draft.id);
    await submitPayroll(draft.id);

    simulateAuditFailure();

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    await expect(
      rejectPayroll(draft.id, { rejectionReason: 'ملاحظة رفض ستفشل ذرياً' }),
    ).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify status remains SUBMITTED, rejectedById remains null
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.SUBMITTED);
    expect(dbEntry.rejectedById).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 6. REOPEN Atomicity
  // ---------------------------------------------------------------------------
  it('reopenPayroll: simulated audit failure rolls back reopening', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند إعادة الفتح',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'قيد لاختبار إعادة الفتح الذري',
    });
    cleanupPayrollIds.push(draft.id);
    await submitPayroll(draft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await rejectPayroll(draft.id, { rejectionReason: 'رفض حقيقي قبل اختبار إعادة الفتح' });

    // Now Accountant attempts to reopen with simulated audit failure
    simulateAuditFailure();

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    await expect(reopenPayroll(draft.id)).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify status remains REJECTED
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.REJECTED);
    expect(dbEntry.rejectedById).toBe(testManager.id);
  });

  // ---------------------------------------------------------------------------
  // 7. CANCEL Atomicity
  // ---------------------------------------------------------------------------
  it('cancelPayroll: simulated audit failure rolls back cancellation', async () => {
    const { project, laborLine } = await setupProjectWithLaborLine('50000.00');

    const draft = await createPayrollDraft({
      projectId: project.id,
      budgetLineId: laborLine.id,
      workerName: 'عامل اختبار الذرية عند الإلغاء',
      periodYear: 2026,
      periodMonth: 9,
      amount: '5000.00',
      description: 'قيد لاختبار الإلغاء الذري',
    });
    cleanupPayrollIds.push(draft.id);

    simulateAuditFailure();

    await expect(
      cancelPayroll(draft.id, { cancellationReason: 'محاولة إلغاء ستفشل ذرياً' }),
    ).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify status remains DRAFT, cancelledById remains null
    const dbEntry = await prisma.payrollEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbEntry.status).toBe(PayrollStatus.DRAFT);
    expect(dbEntry.cancelledById).toBeNull();
  });
});
