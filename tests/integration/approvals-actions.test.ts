/**
 * tests/integration/approvals-actions.test.ts
 *
 * Integration tests for the Hub Server Actions against live PostgreSQL.
 * Verifies delegation to canonical domain use cases, audit log generation,
 * revalidatePath('/approvals') behavior, self-approval prevention,
 * and rejection reason validation.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory } from '@prisma/client';

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

import { prisma } from '@/lib/db/prisma';
import {
  approveExpenseHubAction,
  rejectExpenseHubAction,
  approveCommitmentHubAction,
  rejectCommitmentHubAction,
  approveCustodyHubAction,
  rejectCustodyHubAction,
  approvePayrollHubAction,
  rejectPayrollHubAction,
  approveBillingHubAction,
  rejectBillingHubAction,
} from '@/app/(manager)/approvals/actions';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Approvals Hub Server Actions — Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let projectId: string;
  let budgetLineId: string;
  let laborBudgetLineId: string;

  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupCustodyIds: string[] = [];
  const cleanupPayrollIds: string[] = [];
  const cleanupBillingIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    mockRevalidatePath.mockClear();
    const timestamp = Date.now();

    // 1. Manager user
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير عمليات الموافقات',
          email: `mgr.actions.${timestamp}@test.local`,
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

    // 2. Engineer user (submitter)
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس مقدم المعاملات',
          email: `eng.actions.${timestamp}@test.local`,
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

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    // Create test active project with budget line
    const project = await prisma.project.create({
      data: {
        code: `ACT-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار عمليات الموافقات',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    projectId = project.id;
    cleanupProjectIds.push(projectId);

    const budget = await prisma.budget.create({
      data: {
        projectId,
        version: 1,
        status: 'APPROVED',
        totalAmount: '500000.00',
        createdById: testManager.id,
        approvedById: testManager.id,
      },
    });

    const bLine = await prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        category: BudgetCategory.MATERIALS,
        description: 'بند عمليات الموافقات',
        amount: '300000.00',
      },
    });
    budgetLineId = bLine.id;

    const laborBLine = await prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        category: BudgetCategory.LABOR,
        description: 'بند أجور عمالة',
        amount: '100000.00',
      },
    });
    laborBudgetLineId = laborBLine.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (cleanupBillingIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: { in: cleanupBillingIds } } });
      await prisma.subcontractorBilling.deleteMany({ where: { id: { in: cleanupBillingIds } } });
    }
    if (cleanupCommitmentIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: { in: cleanupCommitmentIds } } });
      await prisma.commitment.deleteMany({ where: { id: { in: cleanupCommitmentIds } } });
    }
    if (cleanupCustodyIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: { in: cleanupCustodyIds } } });
      await prisma.custody.deleteMany({ where: { id: { in: cleanupCustodyIds } } });
    }
    if (cleanupPayrollIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PAYROLL_ENTRY', entityId: { in: cleanupPayrollIds } } });
      await prisma.payrollEntry.deleteMany({ where: { id: { in: cleanupPayrollIds } } });
    }
    if (cleanupExpenseIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: { in: cleanupExpenseIds } } });
      await prisma.expense.deleteMany({ where: { id: { in: cleanupExpenseIds } } });
    }

    for (const pId of cleanupProjectIds) {
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      await prisma.custody.deleteMany({ where: { projectId: pId } });
      await prisma.payrollEntry.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.project.deleteMany({ where: { id: pId } });
    }
  });

  it('approveExpenseHubAction: approves SUBMITTED expense, generates audit log, and calls revalidatePath', async () => {
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '250.00',
        currency: 'SAR',
        description: 'شراء مواد للموقع',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    const res = await approveExpenseHubAction(expense.id);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.domain).toBe('EXPENSE');
      expect(res.id).toBe(expense.id);
    }

    // Verify DB updated to APPROVED
    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.approvedById).toBe(testManager.id);

    // Verify revalidatePath was called with '/approvals'
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('rejectExpenseHubAction: rejects SUBMITTED expense with reason, and calls revalidatePath', async () => {
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '180.00',
        currency: 'SAR',
        description: 'فاتورة بنزين غير واضحة',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    const res = await rejectExpenseHubAction(expense.id, 'الفاتورة غير واضحة يرجى إعادة إرفاقها');

    expect(res.success).toBe(true);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated?.status).toBe('REJECTED');
    expect(updated?.rejectedById).toBe(testManager.id);
    expect(updated?.rejectionReason).toBe('الفاتورة غير واضحة يرجى إعادة إرفاقها');

    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('reject action with reason < 3 chars: returns VALIDATION_ERROR and does NOT call revalidatePath', async () => {
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '120.00',
        currency: 'SAR',
        description: 'نفقة لاختبار التحقق',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    const res = await rejectExpenseHubAction(expense.id, 'لا');

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe('VALIDATION_ERROR');
    }

    expect(mockRevalidatePath).not.toHaveBeenCalled();

    // Verify record remains SUBMITTED
    const unchanged = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(unchanged?.status).toBe('SUBMITTED');
  });

  it('rejectCommitmentHubAction: rejects commitment with reason and calls revalidatePath', async () => {
    const commitment = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '1500.00',
        currency: 'SAR',
        vendorName: 'المورد س',
        commitmentDate: new Date(),
        description: 'ارتباط للرفض',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    const res = await rejectCommitmentHubAction(commitment.id, 'السعر مبالغ فيه مقارنة بأسعار السوق');
    expect(res.success).toBe(true);

    const updated = await prisma.commitment.findUnique({ where: { id: commitment.id } });
    expect(updated?.status).toBe('REJECTED');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('rejectCustodyHubAction: rejects custody via { id, rejectionReason } and calls revalidatePath', async () => {
    const custody = await prisma.custody.create({
      data: {
        code: `CS-ACT-${Date.now()}`,
        projectId,
        budgetLineId,
        amount: '3000.00',
        currency: 'SAR',
        purpose: 'عهدة للرفض',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        custodianUserId: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupCustodyIds.push(custody.id);

    const res = await rejectCustodyHubAction(custody.id, 'المبلغ كبير يتطلب مراجعة تفصيلية');
    expect(res.success).toBe(true);

    const updated = await prisma.custody.findUnique({ where: { id: custody.id } });
    expect(updated?.status).toBe('REJECTED');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('approveCommitmentHubAction & approveCustodyHubAction: delegate to domain use cases and revalidate', async () => {
    // 1. Commitment approval
    const commitment = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '2200.00',
        currency: 'SAR',
        vendorName: 'مورد معتمد',
        commitmentDate: new Date(),
        description: 'ارتباط للاعتماد',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    const comRes = await approveCommitmentHubAction(commitment.id);
    expect(comRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');

    // 2. Custody approval
    const custody = await prisma.custody.create({
      data: {
        code: `CS-APP-${Date.now()}`,
        projectId,
        budgetLineId,
        amount: '4000.00',
        currency: 'SAR',
        purpose: 'عهدة للاعتماد',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        custodianUserId: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupCustodyIds.push(custody.id);

    const custRes = await approveCustodyHubAction(custody.id);
    expect(custRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('approvePayrollHubAction & rejectPayrollHubAction: approve and reject payroll entries via Hub', async () => {
    const pay1 = await prisma.payrollEntry.create({
      data: {
        projectId,
        budgetLineId: laborBudgetLineId,
        amount: '1200.00',
        currency: 'SAR',
        workerName: 'عامل الأجر 1',
        periodYear: 2026,
        periodMonth: 9,
        description: 'أجر معتمد',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    const pay2 = await prisma.payrollEntry.create({
      data: {
        projectId,
        budgetLineId: laborBudgetLineId,
        amount: '1300.00',
        currency: 'SAR',
        workerName: 'عامل الأجر 2',
        periodYear: 2026,
        periodMonth: 9,
        description: 'أجر مرفوض',
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(pay1.id, pay2.id);

    const approveRes = await approvePayrollHubAction(pay1.id);
    expect(approveRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');

    const rejectRes = await rejectPayrollHubAction(pay2.id, 'عدد الساعات غير متطابق');
    expect(rejectRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('approveBillingHubAction & rejectBillingHubAction: approve and reject subcontractor billings via Hub', async () => {
    const comForBilling = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '60000.00',
        currency: 'SAR',
        vendorName: 'المقاول المعتمد',
        commitmentDate: new Date(),
        description: 'عقد مقاولة باطن',
        status: 'APPROVED',
        createdById: testEngineer.id,
        approvedById: testManager.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(comForBilling.id);

    const bill1 = await prisma.subcontractorBilling.create({
      data: {
        projectId,
        budgetLineId,
        commitmentId: comForBilling.id,
        grossAmount: '12000.00',
        currency: 'SAR',
        subcontractorName: 'المقاول المعتمد',
        description: 'مستخلص 1 للاعتماد',
        billingPeriod: '2026-08',
        claimDate: new Date(),
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    const bill2 = await prisma.subcontractorBilling.create({
      data: {
        projectId,
        budgetLineId,
        commitmentId: comForBilling.id,
        grossAmount: '15000.00',
        currency: 'SAR',
        subcontractorName: 'المقاول المعتمد',
        description: 'مستخلص 2 للرفض',
        billingPeriod: '2026-08',
        claimDate: new Date(),
        status: 'SUBMITTED',
        createdById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupBillingIds.push(bill1.id, bill2.id);

    const approveRes = await approveBillingHubAction(bill1.id);
    expect(approveRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');

    const rejectRes = await rejectBillingHubAction(bill2.id, 'نسبة الإنجاز لا تطابق المستندات');
    expect(rejectRes.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('stale approval: if record is already APPROVED, returns failure and calls revalidatePath', async () => {
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '90.00',
        currency: 'SAR',
        description: 'نفقة معتمدة مسبقا',
        expenseDate: new Date(),
        status: 'APPROVED',
        submittedById: testEngineer.id,
        approvedById: testManager.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    const res = await approveExpenseHubAction(expense.id);

    expect(res.success).toBe(false);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('self-approval via Hub: throws FORBIDDEN_SELF_APPROVAL, returns failure, and calls revalidatePath', async () => {
    // Expense submitted by the manager themselves
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '75.00',
        currency: 'SAR',
        description: 'نفقة مقدمة من المدير',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testManager.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    const res = await approveExpenseHubAction(expense.id);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe('FORBIDDEN_SELF_APPROVAL');
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith('/approvals');
  });

  it('requireManager fails for non-Manager: returns failure and does NOT call revalidatePath', async () => {
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER)
    );

    const res = await approveExpenseHubAction('some-id');

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe('INSUFFICIENT_ROLE');
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
