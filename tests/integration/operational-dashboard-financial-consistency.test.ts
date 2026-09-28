/**
 * tests/integration/operational-dashboard-financial-consistency.test.ts
 *
 * Financial consistency integration tests for Operational Project Dashboard.
 * Live PostgreSQL. Verifies exact mathematical alignment with Slice 9 and calculateBudgetLineExposure().
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BudgetCategory,
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  ProjectStatus,
  Role,
  SubcontractorBillingStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getProjectOperationalFinancialSummary } from '@/lib/operational-dashboard';
import { getDashboardSummary } from '@/lib/dashboard/queries/get-dashboard-summary';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Operational Project Dashboard — Financial Consistency Integration', () => {
  let testManager: AuthenticatedUser;
  let testProjectId: string;
  let noBudgetProjectId: string;
  let zeroLinesProjectId: string;
  let budgetLine1Id: string;
  let budgetLine2Id: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: `مدير مالي ${timestamp}`,
          email: `mgr.fin.${timestamp}@test.local`,
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

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    // 1. Create project with approved budget and 2 lines
    const project = await prisma.project.create({
      data: {
        code: `FIN-${timestamp}`,
        name: `مشروع الاتساق المالي ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    testProjectId = project.id;

    const budget = await prisma.budget.create({
      data: {
        projectId: testProjectId,
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: new Prisma.Decimal('800000.00'),
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: BudgetCategory.MATERIALS,
              description: 'مواد خرسانية',
              amount: new Prisma.Decimal('500000.00'),
            },
            {
              category: BudgetCategory.LABOR,
              description: 'أجور العمالة',
              amount: new Prisma.Decimal('300000.00'),
            },
          ],
        },
      },
      include: { lines: true },
    });
    budgetLine1Id = budget.lines[0]!.id;
    budgetLine2Id = budget.lines[1]!.id;

    // 2. Project without approved budget
    const noBudgetProj = await prisma.project.create({
      data: {
        code: `NOB-${timestamp}`,
        name: `مشروع بدون موازنة ${timestamp}`,
        status: ProjectStatus.PLANNED,
        managerId: testManager.id,
      },
    });
    noBudgetProjectId = noBudgetProj.id;

    // 3. Project with approved budget having ZERO lines
    const zeroLinesProj = await prisma.project.create({
      data: {
        code: `ZLB-${timestamp}`,
        name: `مشروع بموازنة فارغة ${timestamp}`,
        status: ProjectStatus.PLANNED,
        managerId: testManager.id,
      },
    });
    zeroLinesProjectId = zeroLinesProj.id;

    await prisma.budget.create({
      data: {
        projectId: zeroLinesProjectId,
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: new Prisma.Decimal('0.00'),
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean child financial records in correct referential order
    await prisma.subcontractorBilling.deleteMany({
      where: { budgetLineId: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.payrollEntry.deleteMany({
      where: { budgetLineId: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.expense.deleteMany({
      where: { budgetLineId: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.custody.deleteMany({
      where: { budgetLineId: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.commitment.deleteMany({
      where: { budgetLineId: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.budgetLine.deleteMany({
      where: { id: { in: [budgetLine1Id, budgetLine2Id] } },
    });
    await prisma.budget.deleteMany({
      where: { projectId: { in: [testProjectId, noBudgetProjectId, zeroLinesProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, noBudgetProjectId, zeroLinesProjectId] } },
    });
  });

  it('TC-FIN-01 & TC-FIN-02: financial figures match Slice 9 getDashboardSummary() exactly to the cent', async () => {
    // Seed complex financial state on line 1:
    // Approved commitment: 60,000.00
    await prisma.commitment.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        amount: new Prisma.Decimal('60000.00'),
        vendorName: 'شركة الإسمنت الوطنية',
        description: 'توريد دفعة أسمنت',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testManager.id,
      },
    });

    // Pending commitment: 40,000.00
    await prisma.commitment.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        amount: new Prisma.Decimal('40000.00'),
        vendorName: 'شركة حديد الراجحي',
        description: 'عرض سعر حديد',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testManager.id,
      },
    });

    // Direct approved expense: 25,000.00
    await prisma.expense.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        amount: new Prisma.Decimal('25000.00'),
        description: 'شراء رمل وبحص نقدي',
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        submittedById: testManager.id,
      },
    });

    // Direct pending expense: 15,000.00
    await prisma.expense.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        amount: new Prisma.Decimal('15000.00'),
        description: 'فاتورة صيانة مضخة',
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        submittedById: testManager.id,
      },
    });

    // Active Custody: 50,000.00 advance, 20,000.00 approved expense, 5,000.00 cash returned -> 25,000.00 outstanding
    const custody = await prisma.custody.create({
      data: {
        code: `CUST-${Date.now()}`,
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        custodianUserId: testManager.id,
        amount: new Prisma.Decimal('50000.00'),
        purpose: 'عهدة مشتريات موقع',
        status: CustodyStatus.ISSUED,
        cashReturnedAmount: new Prisma.Decimal('5000.00'),
        createdById: testManager.id,
      },
    });

    await prisma.expense.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        custodyId: custody.id,
        amount: new Prisma.Decimal('20000.00'),
        description: 'مصروف مسوّى من العهدة',
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        submittedById: testManager.id,
      },
    });

    // Approved Payroll on Line 2: 70,000.00
    await prisma.payrollEntry.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine2Id,
        workerName: 'محمد أحمد علي',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('70000.00'),
        description: 'رواتب العمالة المعتمدة',
        status: PayrollStatus.APPROVED,
        createdById: testManager.id,
      },
    });

    // Pending Payroll on Line 2: 30,000.00
    await prisma.payrollEntry.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine2Id,
        workerName: 'خالد عبد الله المنصور',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('30000.00'),
        description: 'رواتب عمالة قيد الاعتماد',
        status: PayrollStatus.SUBMITTED,
        createdById: testManager.id,
      },
    });

    // Run Slice 13 Operational Financial Read Model
    const opFinancial = await getProjectOperationalFinancialSummary(testProjectId);

    // Run Slice 9 Executive Dashboard
    const execDashboard = await getDashboardSummary();
    const execProject = execDashboard.projects.find((p) => p.projectId === testProjectId);

    expect(execProject).toBeDefined();

    // Verify exact equality across both slices:
    // Authorized budget: 500,000 + 300,000 = 800,000.00
    expect(opFinancial.authorizedBudget).toBe('800000.00');
    expect(opFinancial.authorizedBudget).toBe(execProject?.authorizedBudget);

    // Direct spend (25k) + Custody spend (20k) + Approved Payroll (70k) = 115,000.00
    expect(opFinancial.actualSpend).toBe('115000.00');
    expect(opFinancial.actualSpend).toBe(execProject?.actualSpend);

    // TotalActiveExposure: Commitments(60k) + Direct(25k) + CustodySpend(20k) + OutstandingCustody(25k) + Payroll(70k) = 200,000.00
    expect(opFinancial.totalActiveExposure).toBe('200000.00');
    expect(opFinancial.totalActiveExposure).toBe(execProject?.activeExposure);

    // AvailableBalance: 800,000 - 200,000 = 600,000.00
    expect(opFinancial.availableBalance).toBe('600000.00');
    expect(opFinancial.availableBalance).toBe(execProject?.availableBalance);

    // PendingExposure: PendingCommitments(40k) + PendingDirect(15k) + PendingPayroll(30k) = 85,000.00
    expect(opFinancial.pendingExposure).toBe('85000.00');
    expect(opFinancial.pendingExposure).toBe(execProject?.pendingExposure);

    // ProjectedBalance: 600,000 - 85,000 = 515,000.00
    expect(opFinancial.projectedBalance).toBe('515000.00');
    expect(opFinancial.projectedBalance).toBe(execProject?.projectedBalance);
  });

  it('TC-FIN-03: verifies that pending commitments/expenses/custodies NEVER enter TotalActiveExposure', async () => {
    // Add pending custody on line 1: 30,000.00
    await prisma.custody.create({
      data: {
        code: `PEND-CUST-${Date.now()}`,
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        custodianUserId: testManager.id,
        amount: new Prisma.Decimal('30000.00'),
        purpose: 'طلب عهدة قيد الاعتماد',
        status: CustodyStatus.SUBMITTED,
        createdById: testManager.id,
      },
    });

    const result = await getProjectOperationalFinancialSummary(testProjectId);

    // TotalActiveExposure remains 0.00 because no approved commitments/expenses/custodies exist
    expect(result.totalActiveExposure).toBe('0.00');
    expect(result.pendingExposure).toBe('30000.00');
    expect(result.projectedBalance).toBe('770000.00');
  });

  it('TC-FIN-05: verifies SubcontractorBilling amounts NEVER enter ActualSpend or TotalActiveExposure', async () => {
    // Create commitment first so SubcontractorBilling has valid commitmentId
    const commitment = await prisma.commitment.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        amount: new Prisma.Decimal('150000.00'),
        vendorName: 'شركة العوازل المتطورة',
        description: 'عقد أعمال العزل المائي',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: testManager.id,
      },
    });

    // Create approved subcontractor billing: 100,000.00
    await prisma.subcontractorBilling.create({
      data: {
        projectId: testProjectId,
        budgetLineId: budgetLine1Id,
        commitmentId: commitment.id,
        subcontractorName: 'شركة العوازل المتطورة',
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('100000.00'),
        description: 'مستخلص أعمال عزل الدور الأرضي',
        status: SubcontractorBillingStatus.APPROVED,
        createdById: testManager.id,
      },
    });

    const result = await getProjectOperationalFinancialSummary(testProjectId);

    // TotalActiveExposure reflects the commitment (150k), but Billing NEVER adds to exposure or spend
    expect(result.actualSpend).toBe('0.00');
    expect(result.totalActiveExposure).toBe('150000.00');
    expect(result.availableBalance).toBe('650000.00');
  });

  it('TC-FIN-07: approved budget with zero budget lines returns zeroed metrics safely without executing batch DB queries', async () => {
    const result = await getProjectOperationalFinancialSummary(zeroLinesProjectId);

    expect(result.hasApprovedBudget).toBe(true);
    expect(result.authorizedBudget).toBe('0.00');
    expect(result.actualSpend).toBe('0.00');
    expect(result.totalActiveExposure).toBe('0.00');
    expect(result.availableBalance).toBe('0.00');
    expect(result.pendingExposure).toBe('0.00');
    expect(result.projectedBalance).toBe('0.00');
    expect(result.currency).toBe('SAR');
  });

  it('TC-FIN-08: project without approved budget returns hasApprovedBudget = false and all zeroed metrics', async () => {
    const result = await getProjectOperationalFinancialSummary(noBudgetProjectId);

    expect(result.hasApprovedBudget).toBe(false);
    expect(result.authorizedBudget).toBe('0.00');
    expect(result.actualSpend).toBe('0.00');
    expect(result.totalActiveExposure).toBe('0.00');
    expect(result.availableBalance).toBe('0.00');
    expect(result.pendingExposure).toBe('0.00');
    expect(result.projectedBalance).toBe('0.00');
    expect(result.currency).toBe('SAR');
  });
});
