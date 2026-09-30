/**
 * tests/integration/approvals-queries.test.ts
 *
 * Query layer integration tests for the Centralized Manager Approvals Hub.
 * Live PostgreSQL. Verifies filtering, exclusion of drafts/approved/soft-deleted records,
 * deterministic ordering, and pagination.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  getPendingExpenses,
  getPendingCommitments,
  getPendingCustodies,
  getPendingPayroll,
  getPendingBillings,
  getPendingCounts,
} from '@/lib/approvals';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Approvals Hub Queries — Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testUser: { id: string };
  let projectId: string;
  let budgetLineId: string;

  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupCustodyIds: string[] = [];
  const cleanupPayrollIds: string[] = [];
  const cleanupBillingIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    const timestamp = Date.now();

    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير استعلامات الموافقات',
          email: `mgr.queries.${timestamp}@test.local`,
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
    testUser = { id: mgr.id };

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    // Create test project + budget + budget line
    const project = await prisma.project.create({
      data: {
        code: `APPR-Q-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار استعلامات الموافقات',
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
        description: 'بند استعلامات',
        amount: '200000.00',
      },
    });
    budgetLineId = bLine.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (cleanupBillingIds.length) {
      await prisma.subcontractorBilling.deleteMany({ where: { id: { in: cleanupBillingIds } } });
    }
    if (cleanupExpenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: cleanupExpenseIds } } });
    }
    if (cleanupCommitmentIds.length) {
      await prisma.commitment.deleteMany({ where: { id: { in: cleanupCommitmentIds } } });
    }
    if (cleanupCustodyIds.length) {
      await prisma.custody.deleteMany({ where: { id: { in: cleanupCustodyIds } } });
    }
    if (cleanupPayrollIds.length) {
      await prisma.payrollEntry.deleteMany({ where: { id: { in: cleanupPayrollIds } } });
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

  it('filters only SUBMITTED and active records across all domains, excluding drafts, approved, and soft-deleted', async () => {
    // EXPENSES
    const expSubmitted = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '100.00',
        currency: 'SAR',
        description: 'نفقة معلقة',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testUser.id,
        submittedAt: new Date('2026-09-01T10:00:00Z'),
      },
    });
    const expDraft = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '150.00',
        currency: 'SAR',
        description: 'مسودة',
        expenseDate: new Date(),
        status: 'DRAFT',
        submittedById: testUser.id,
      },
    });
    const expApproved = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '200.00',
        currency: 'SAR',
        description: 'معتمد',
        expenseDate: new Date(),
        status: 'APPROVED',
        submittedById: testUser.id,
        approvedById: testManager.id,
        submittedAt: new Date('2026-08-01T10:00:00Z'),
      },
    });
    const expDeleted = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '300.00',
        currency: 'SAR',
        description: 'محذوف',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testUser.id,
        submittedAt: new Date('2026-08-01T10:00:00Z'),
        deletedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expSubmitted.id, expDraft.id, expApproved.id, expDeleted.id);

    // COMMITMENTS
    const comSubmitted = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '1000.00',
        currency: 'SAR',
        vendorName: 'المورد س',
        commitmentDate: new Date(),
        description: 'ارتباط معلق',
        status: 'SUBMITTED',
        createdById: testUser.id,
        submittedById: testUser.id,
        submittedAt: new Date('2026-09-01T11:00:00Z'),
      },
    });
    const comDraft = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '1200.00',
        currency: 'SAR',
        vendorName: 'المورد س',
        commitmentDate: new Date(),
        description: 'مسودة ارتباط',
        status: 'DRAFT',
        createdById: testUser.id,
      },
    });
    cleanupCommitmentIds.push(comSubmitted.id, comDraft.id);

    // CUSTODIES
    const custSubmitted = await prisma.custody.create({
      data: {
        code: `CS-${Date.now()}`,
        projectId,
        budgetLineId,
        amount: '2500.00',
        currency: 'SAR',
        purpose: 'عهدة معلقة',
        status: 'SUBMITTED',
        createdById: testUser.id,
        custodianUserId: testUser.id,
        submittedAt: new Date('2026-09-01T12:00:00Z'),
      },
    });
    const custDraft = await prisma.custody.create({
      data: {
        code: `CS-DRAFT-${Date.now()}`,
        projectId,
        budgetLineId,
        amount: '2000.00',
        currency: 'SAR',
        purpose: 'مسودة عهدة',
        status: 'DRAFT',
        createdById: testUser.id,
        custodianUserId: testUser.id,
      },
    });
    cleanupCustodyIds.push(custSubmitted.id, custDraft.id);

    // PAYROLL
    const paySubmitted = await prisma.payrollEntry.create({
      data: {
        projectId,
        budgetLineId,
        amount: '3500.00',
        currency: 'SAR',
        workerName: 'عامل تجربة',
        periodYear: 2026,
        periodMonth: 9,
        description: 'أجر معلق',
        status: 'SUBMITTED',
        createdById: testUser.id,
        submittedAt: new Date('2026-09-01T13:00:00Z'),
      },
    });
    const payDraft = await prisma.payrollEntry.create({
      data: {
        projectId,
        budgetLineId,
        amount: '3000.00',
        currency: 'SAR',
        workerName: 'عامل مسودة',
        periodYear: 2026,
        periodMonth: 9,
        description: 'مسودة أجر',
        status: 'DRAFT',
        createdById: testUser.id,
      },
    });
    cleanupPayrollIds.push(paySubmitted.id, payDraft.id);

    // BILLINGS
    const billSubmitted = await prisma.subcontractorBilling.create({
      data: {
        projectId,
        budgetLineId,
        commitmentId: comSubmitted.id,
        grossAmount: '45000.00',
        currency: 'SAR',
        subcontractorName: 'المورد س',
        description: 'مستخلص أعمال عظم',
        billingPeriod: '2026-08',
        claimDate: new Date(),
        status: 'SUBMITTED',
        createdById: testUser.id,
        submittedAt: new Date('2026-09-01T14:00:00Z'),
      },
    });
    const billDraft = await prisma.subcontractorBilling.create({
      data: {
        projectId,
        budgetLineId,
        commitmentId: comSubmitted.id,
        grossAmount: '40000.00',
        currency: 'SAR',
        subcontractorName: 'المورد س',
        description: 'مستخلص مسودة',
        billingPeriod: '2026-08',
        claimDate: new Date(),
        status: 'DRAFT',
        createdById: testUser.id,
      },
    });
    cleanupBillingIds.push(billSubmitted.id, billDraft.id);

    // Verify Expense query
    const expResult = await getPendingExpenses({ pageSize: 500 });
    const expIds = expResult.items.map((i) => i.id);
    expect(expIds).toContain(expSubmitted.id);
    expect(expIds).not.toContain(expDraft.id);
    expect(expIds).not.toContain(expApproved.id);
    expect(expIds).not.toContain(expDeleted.id);

    // Verify Commitment query
    const comResult = await getPendingCommitments({ pageSize: 500 });
    const comIds = comResult.items.map((i) => i.id);
    expect(comIds).toContain(comSubmitted.id);
    expect(comIds).not.toContain(comDraft.id);

    // Verify Custody query
    const custResult = await getPendingCustodies({ pageSize: 500 });
    const custIds = custResult.items.map((i) => i.id);
    expect(custIds).toContain(custSubmitted.id);
    expect(custIds).not.toContain(custDraft.id);

    // Verify Payroll query
    const payResult = await getPendingPayroll({ pageSize: 500 });
    const payIds = payResult.items.map((i) => i.id);
    expect(payIds).toContain(paySubmitted.id);
    expect(payIds).not.toContain(payDraft.id);

    // Verify Billing query
    const billResult = await getPendingBillings({ pageSize: 500 });
    const billIds = billResult.items.map((i) => i.id);
    expect(billIds).toContain(billSubmitted.id);
    expect(billIds).not.toContain(billDraft.id);

    // Verify PendingCountsDTO
    const counts = await getPendingCounts();
    expect(counts.expenses).toBeGreaterThanOrEqual(1);
    expect(counts.commitments).toBeGreaterThanOrEqual(1);
    expect(counts.custodies).toBeGreaterThanOrEqual(1);
    expect(counts.payroll).toBeGreaterThanOrEqual(1);
    expect(counts.billings).toBeGreaterThanOrEqual(1);
    expect(counts.total).toBe(
      counts.expenses +
        counts.commitments +
        counts.custodies +
        counts.payroll +
        counts.billings
    );
  });

  it('enforces deterministic ordering: submittedAt ASC, id ASC', async () => {
    const t1 = new Date('2026-09-01T08:00:00Z');
    const t2 = new Date('2026-09-01T09:00:00Z');
    const t3 = new Date('2026-09-01T10:00:00Z');

    const exp1 = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '10.00',
        currency: 'SAR',
        description: 'item 2',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testUser.id,
        submittedAt: t2,
      },
    });

    const exp2 = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '20.00',
        currency: 'SAR',
        description: 'item 1',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testUser.id,
        submittedAt: t1,
      },
    });

    const exp3 = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '30.00',
        currency: 'SAR',
        description: 'item 3',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testUser.id,
        submittedAt: t3,
      },
    });
    cleanupExpenseIds.push(exp1.id, exp2.id, exp3.id);

    const res = await getPendingExpenses({ pageSize: 100 });
    const relevantItems = res.items.filter((i) =>
      [exp1.id, exp2.id, exp3.id].includes(i.id)
    );

    expect(relevantItems.map((i) => i.id)).toEqual([exp2.id, exp1.id, exp3.id]);
  });

  it('supports pagination on domain tabs with page and pageSize', async () => {
    const resPage1 = await getPendingExpenses({ page: 1, pageSize: 2 });
    expect(resPage1.items.length).toBeLessThanOrEqual(2);

    const resPage2 = await getPendingExpenses({ page: 2, pageSize: 2 });
    expect(resPage2.items.length).toBeLessThanOrEqual(2);

    // If there are distinct items, page 1 and page 2 items should not overlap
    if (resPage1.items.length > 0 && resPage2.items.length > 0) {
      const page1Ids = resPage1.items.map((i) => i.id);
      const page2Ids = resPage2.items.map((i) => i.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    }
  });
});
