/**
 * tests/integration/payroll-approval-concurrency.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Concurrency integration tests on live PostgreSQL:
 *
 * 1. Payroll vs Payroll Concurrency:
 *    - BudgetLine = 400.00 SAR.
 *    - Two submitted PayrollEntries A = 300.00 SAR, B = 300.00 SAR (Total = 600.00 SAR > 400.00 SAR).
 *    - Concurrent approvePayroll calls via Promise.allSettled.
 *    - Row-level lock (SELECT ... FOR UPDATE on budget_lines) serializes execution.
 *    - Exactly ONE succeeds, exactly ONE fails with BUDGET_LINE_EXCEEDED.
 *    - Final DB state: SUM(APPROVED payroll) === 300.00 SAR <= 400.00 SAR.
 *
 * 2. Cross-Domain: Payroll vs Expense Concurrency:
 *    - BudgetLine = 500.00 SAR (LABOR).
 *    - Submitted Payroll = 300.00 SAR.
 *    - Submitted Expense = 300.00 SAR.
 *    - Concurrent approvePayroll and approveExpense calls via Promise.allSettled.
 *    - Both take Canonical Lock 1 on budget_lines FOR UPDATE.
 *    - Exactly ONE succeeds, exactly ONE fails with BUDGET_LINE_EXCEEDED.
 *    - No deadlock, combined approved exposure <= 500.00 SAR.
 *
 * 3. Cross-Domain: Payroll vs Commitment Concurrency:
 *    - BudgetLine = 500.00 SAR (LABOR).
 *    - Submitted Payroll = 300.00 SAR.
 *    - Submitted Commitment = 300.00 SAR.
 *    - Concurrent approvePayroll and approveCommitment calls via Promise.allSettled.
 *    - Both take Canonical Lock 1 on budget_lines FOR UPDATE.
 *    - Exactly ONE succeeds, exactly ONE fails with BUDGET_LINE_EXCEEDED.
 *    - No deadlock, combined approved exposure <= 500.00 SAR.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  PayrollStatus,
  ExpenseStatus,
  CommitmentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { approvePayroll } from '@/lib/payroll';
import { approveExpense } from '@/lib/expenses';
import { approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll Approval Concurrency & Overspend Protection (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupPayrollIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير سباق اعتماد الرواتب',
          email: `mgr.paycon.${Date.now()}@test.local`,
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
          name: 'محاسب سباق الرواتب',
          email: `acc.paycon.${Date.now()}@test.local`,
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
          name: 'مهندس سباق الرواتب',
          email: `eng.paycon.${Date.now()}@test.local`,
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

    // 4. Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات سباق الرواتب',
          email: `pur.paycon.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const id of cleanupPayrollIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PAYROLL_ENTRY', entityId: id } });
      await prisma.payrollEntry.deleteMany({ where: { id } });
    }
    cleanupPayrollIds.length = 0;

    for (const id of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: id } });
      await prisma.expense.deleteMany({ where: { id } });
    }
    cleanupExpenseIds.length = 0;

    for (const id of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: id } });
      await prisma.commitment.deleteMany({ where: { id } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.payrollEntry.deleteMany({ where: { projectId: pId } });
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

  async function setupProjectWithLaborLine(amount: string) {
    const code = `PRJ-R${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع سباق الرواتب ${code}`,
      description: 'مشروع فحص التزامن لرواتب العمالة',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.LABOR,
          description: 'بند أجور وعمالة التزامن',
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

    return { project, budgetLine: laborLine };
  }

  // ---------------------------------------------------------------------------
  // 1. Payroll vs Payroll Concurrency
  // ---------------------------------------------------------------------------
  it('payroll vs payroll: serializes concurrent payroll approvals, exactly one succeeds and one fails', async () => {
    const { project, budgetLine } = await setupProjectWithLaborLine('400.00');

    // Seed two submitted payroll entries of 300.00 SAR each
    const entryA = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        workerName: 'العامل الأول',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'قيد رواتب أ',
        status: PayrollStatus.SUBMITTED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(entryA.id);

    const entryB = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        workerName: 'العامل الثاني',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'قيد رواتب ب',
        status: PayrollStatus.SUBMITTED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(entryB.id);

    // Concurrent approvals
    const [resultA, resultB] = await Promise.allSettled([
      approvePayroll(entryA.id),
      approvePayroll(entryB.id),
    ]);

    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // Verify DB state: total approved payroll spend is exactly 300.00 SAR
    const approvedEntries = await prisma.payrollEntry.findMany({
      where: { budgetLineId: budgetLine.id, status: PayrollStatus.APPROVED, deletedAt: null },
    });
    expect(approvedEntries.length).toBe(1);
    expect(approvedEntries[0]!.amount.toFixed(2)).toBe('300.00');

    const totalApproved = approvedEntries.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal('0.00'),
    );
    expect(totalApproved.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 2. Payroll vs Expense Concurrency
  // ---------------------------------------------------------------------------
  it('payroll vs expense: concurrent approvals lock BudgetLine first, exactly one succeeds without deadlock', async () => {
    const { project, budgetLine } = await setupProjectWithLaborLine('500.00');

    // Seed submitted Payroll = 300.00 SAR
    const payroll = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        workerName: 'عامل التزامن المشترك',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'قيد رواتب قيد الاعتماد',
        status: PayrollStatus.SUBMITTED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(payroll.id);

    // Seed submitted Expense = 300.00 SAR on the same LABOR line
    const expense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'مصروف عمالة موقعي',
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    // Concurrent approvals
    const [payrollResult, expenseResult] = await Promise.allSettled([
      approvePayroll(payroll.id),
      approveExpense(expense.id),
    ]);

    const fulfilled = [payrollResult, expenseResult].filter((r) => r.status === 'fulfilled');
    const rejected = [payrollResult, expenseResult].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // Verify DB combined exposure <= 500.00 SAR
    const approvedPayrolls = await prisma.payrollEntry.findMany({
      where: { budgetLineId: budgetLine.id, status: PayrollStatus.APPROVED, deletedAt: null },
    });
    const approvedExpenses = await prisma.expense.findMany({
      where: { budgetLineId: budgetLine.id, status: ExpenseStatus.APPROVED, deletedAt: null },
    });

    const totalLaborSpend = approvedPayrolls.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal('0.00'),
    );
    const totalExpenseSpend = approvedExpenses.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal('0.00'),
    );

    const combinedExposure = totalLaborSpend.add(totalExpenseSpend);
    expect(combinedExposure.toFixed(2)).toBe('300.00');
    expect(combinedExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. Payroll vs Commitment Concurrency
  // ---------------------------------------------------------------------------
  it('payroll vs commitment: concurrent approvals serialize under BudgetLine lock without deadlock', async () => {
    const { project, budgetLine } = await setupProjectWithLaborLine('500.00');

    // Seed submitted Payroll = 300.00 SAR
    const payroll = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        workerName: 'عامل التزامن مع الالتزام',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        description: 'قيد رواتب قيد الاعتماد',
        status: PayrollStatus.SUBMITTED,
        createdById: testAccountant.id,
        submittedById: testAccountant.id,
        submittedAt: new Date(),
      },
    });
    cleanupPayrollIds.push(payroll.id);

    // Seed submitted Commitment = 300.00 SAR on the same LABOR line
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('300.00'),
        currency: 'SAR',
        vendorName: 'مقاول عمالة من الباطن',
        description: 'التزام مقاول عمالة',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    // Concurrent approvals
    const [payrollResult, commitmentResult] = await Promise.allSettled([
      approvePayroll(payroll.id),
      approveCommitment(commitment.id),
    ]);

    const fulfilled = [payrollResult, commitmentResult].filter((r) => r.status === 'fulfilled');
    const rejected = [payrollResult, commitmentResult].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // Verify DB combined exposure <= 500.00 SAR
    const approvedPayrolls = await prisma.payrollEntry.findMany({
      where: { budgetLineId: budgetLine.id, status: PayrollStatus.APPROVED, deletedAt: null },
    });
    const approvedCommitments = await prisma.commitment.findMany({
      where: { budgetLineId: budgetLine.id, status: CommitmentStatus.APPROVED, deletedAt: null },
    });

    const totalLaborSpend = approvedPayrolls.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal('0.00'),
    );
    const totalCommitmentSpend = approvedCommitments.reduce(
      (sum, c) => sum.add(c.amount),
      new Prisma.Decimal('0.00'),
    );

    const combinedExposure = totalLaborSpend.add(totalCommitmentSpend);
    expect(combinedExposure.toFixed(2)).toBe('300.00');
    expect(combinedExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });
});
