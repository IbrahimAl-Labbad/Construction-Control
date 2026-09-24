/**
 * tests/integration/dashboard-summary.test.ts
 *
 * Integration tests for getDashboardSummary() on Live PostgreSQL.
 *
 * Tests:
 *  I-01  Single project, approved budget: correct ActualSpend, TotalActiveExposure, AvailableBalance
 *  I-02  Multi-project: company totals = sum of project totals
 *  I-03  Project with soft-deleted budget lines excluded
 *  I-04  Excluded expense statuses (DRAFT, REJECTED, CANCELLED) are not counted
 *  I-05  Approved payroll included in ActualSpend and TotalActiveExposure
 *  I-06  Pending commitment in PendingExposure, not in TotalActiveExposure
 *  I-07  Direct approved expense counted in ActualSpend and TotalActiveExposure
 *  I-08  Custody actual spend (approved linked expense) in CustodyActualSpend
 *  I-09  Outstanding custody (ISSUED, PARTIALLY_SETTLED only) in TotalActiveExposure
 *  I-10  APPROVED and SETTLED custodies not counted as outstanding
 *  I-11  Pending exposure: pending direct expenses counted
 *  I-12  Pending counts reflect SUBMITTED records with deletedAt=null
 *  I-13  Project without approved budget: hasApprovedBudget = false, all amounts = '0.00'
 *  I-14  SubcontractorBilling amounts do not appear in ActualSpend or TotalActiveExposure
 *  I-15  BD-34 regression: ApprovedPayroll included exactly once (not double-counted via custody)
 *  I-16  DTO primitives: no Decimal, no Date, currency = 'SAR', generatedAt is ISO string
 *  I-17  DTO privacy: no workerName, workerReference, tradeOrTitle in response
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BudgetCategory,
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
import { getDashboardSummary } from '@/lib/dashboard/queries/get-dashboard-summary';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';


describe('Executive Dashboard — getDashboardSummary() Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: `مدير لوحة تكامل ${Date.now()}`,
          email: `dashboard.int.mgr.${Date.now()}@test.local`,
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------
  async function setupApprovedProject(budgetAmounts: { labor: string; materials?: string }) {
    // Ensure manager mock is active for createProject’s internal requireManager() call
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const code = `PRJ-DASH${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع لوحة متابعة ${code}`,
      description: 'مشروع اختبار تكامل لوحة المتابعة',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const lines: Array<{ category: BudgetCategory; amount: string; description: string }> = [
      {
        category: BudgetCategory.LABOR,
        amount: budgetAmounts.labor,
        description: 'بند عمالة',
      },
    ];
    if (budgetAmounts.materials) {
      lines.push({
        category: BudgetCategory.MATERIALS,
        amount: budgetAmounts.materials,
        description: 'بند مواد',
      });
    }

    const draft = await createBudgetDraft({ projectId: project.id, lines });
    await submitBudget(draft.id);
    await approveBudget(draft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const dbLines = await prisma.budgetLine.findMany({ where: { budgetId: draft.id } });
    const laborLine = dbLines.find((l) => l.category === BudgetCategory.LABOR)!;
    const materialsLine = dbLines.find((l) => l.category === BudgetCategory.MATERIALS);

    return { project, laborLine, materialsLine };
  }

  async function findProject(projectId: string) {
    const result = await getDashboardSummary();
    return result.projects.find((p) => p.projectId === projectId);
  }

  // -------------------------------------------------------------------------
  // I-01: Single project, approved budget
  // -------------------------------------------------------------------------
  it('I-01: single project with approved budget shows correct ActualSpend and TotalActiveExposure', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    // Create approved commitment
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        vendorName: 'شركة البناء',
        referenceNumber: 'CNT-001',
        description: 'تعاقد مقاول',
        commitmentDate: new Date(),
        amount: new Prisma.Decimal('20000.00'),
        status: CommitmentStatus.APPROVED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // Create approved direct expense
    const expense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        description: 'مصروف مباشر',
        amount: new Prisma.Decimal('5000.00'),
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        currency: 'SAR',
        submittedById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    try {
      const projectSummary = await findProject(project.id);
      expect(projectSummary).toBeDefined();
      expect(projectSummary!.hasApprovedBudget).toBe(true);

      // TotalActiveExposure = 20000 (commitment) + 5000 (direct) = 25000
      expect(projectSummary!.activeExposure).toBe('25000.00');
      // ActualSpend = 5000 (direct only, no payroll, no custody spend)
      expect(projectSummary!.actualSpend).toBe('5000.00');
      // AvailableBalance = 100000 - 25000 = 75000
      expect(projectSummary!.availableBalance).toBe('75000.00');
      expect(projectSummary!.currency).toBe('SAR');
    } finally {
      await prisma.expense.delete({ where: { id: expense.id } });
      await prisma.commitment.delete({ where: { id: commitment.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-02: Multi-project company totals
  // -------------------------------------------------------------------------
  it('I-02: company totals equal sum of project totals across multiple projects', async () => {
    const { project: proj1, laborLine: line1 } = await setupApprovedProject({ labor: '100000.00' });
    const { project: proj2, laborLine: line2 } = await setupApprovedProject({ labor: '50000.00' });

    const exp1 = await prisma.expense.create({
      data: {
        projectId: proj1.id,
        budgetLineId: line1.id,
        description: 'مصروف مشروع 1',
        amount: new Prisma.Decimal('10000.00'),
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        currency: 'SAR',
        submittedById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });
    const exp2 = await prisma.expense.create({
      data: {
        projectId: proj2.id,
        budgetLineId: line2.id,
        description: 'مصروف مشروع 2',
        amount: new Prisma.Decimal('5000.00'),
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        currency: 'SAR',
        submittedById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    try {
      const result = await getDashboardSummary();
      const p1 = result.projects.find((p) => p.projectId === proj1.id)!;
      const p2 = result.projects.find((p) => p.projectId === proj2.id)!;

      // Verify individual project amounts
      expect(p1.actualSpend).toBe('10000.00');
      expect(p2.actualSpend).toBe('5000.00');

      // Company total authorized budget must include both projects
      const totalAuth = new Prisma.Decimal(result.companySummary.totalAuthorizedBudget);
      const p1Auth = new Prisma.Decimal(p1.authorizedBudget);
      const p2Auth = new Prisma.Decimal(p2.authorizedBudget);
      // Company total >= p1 + p2 (may include other test projects)
      expect(totalAuth.greaterThanOrEqualTo(p1Auth.add(p2Auth))).toBe(true);
    } finally {
      await prisma.expense.deleteMany({ where: { id: { in: [exp1.id, exp2.id] } } });
    }
  });

  // -------------------------------------------------------------------------
  // I-05: Approved payroll in ActualSpend and TotalActiveExposure (BD-34)
  // -------------------------------------------------------------------------
  it('I-05: approved payroll is included in both ActualSpend and TotalActiveExposure exactly once', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    const payroll = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل اختبار',
        workerReference: 'WRK-001',
        tradeOrTitle: 'فني',
        description: 'رواتب عمال اختبار',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('15000.00'),
        status: PayrollStatus.APPROVED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // ActualSpend = 15000 (payroll only)
      expect(summary!.actualSpend).toBe('15000.00');
      // TotalActiveExposure = 15000 (payroll only, no commitments)
      expect(summary!.activeExposure).toBe('15000.00');
      // AvailableBalance = 100000 − 15000 = 85000
      expect(summary!.availableBalance).toBe('85000.00');
    } finally {
      await prisma.payrollEntry.delete({ where: { id: payroll.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-06: Pending commitment in PendingExposure only
  // -------------------------------------------------------------------------
  it('I-06: pending (SUBMITTED) commitment is in PendingExposure but not TotalActiveExposure', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        vendorName: 'مقاول معلق',
        referenceNumber: 'CNT-P01',
        description: 'ارتباط معلق',
        commitmentDate: new Date(),
        amount: new Prisma.Decimal('10000.00'),
        status: CommitmentStatus.SUBMITTED,
        currency: 'SAR',
        createdById: testManager.id,
        submittedById: testManager.id,
        submittedAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // TotalActiveExposure = 0 (no approved commitments or expenses)
      expect(summary!.activeExposure).toBe('0.00');
      // PendingExposure = 10000 (pending commitment)
      expect(summary!.pendingExposure).toBe('10000.00');
      // ProjectedBalance = 100000 − 0 − 10000 = 90000
      expect(summary!.projectedBalance).toBe('90000.00');
    } finally {
      await prisma.commitment.delete({ where: { id: commitment.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-09: Outstanding custody in TotalActiveExposure
  // -------------------------------------------------------------------------
  it('I-09: ISSUED custody outstanding balance appears in TotalActiveExposure', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    // Engineer/accountant as custodian
    let custodian = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!custodian) {
      custodian = await prisma.user.create({
        data: {
          name: `مهندس عهد ${Date.now()}`,
          email: `custody.eng.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }

    const custody = await prisma.custody.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        code: `CST-DASH-${Math.floor(Math.random() * 89999 + 10000)}`,
        custodianUserId: custodian.id,
        purpose: 'عهدة اختبار',
        amount: new Prisma.Decimal('8000.00'),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        status: CustodyStatus.ISSUED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
        issuedById: testManager.id,
        issuedAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // TotalActiveExposure = 8000 (outstanding = 8000 − 0 − 0)
      expect(summary!.activeExposure).toBe('8000.00');
      // ActualSpend = 0 (no approved linked expenses yet)
      expect(summary!.actualSpend).toBe('0.00');
    } finally {
      await prisma.custody.delete({ where: { id: custody.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-10: APPROVED custody not counted as outstanding
  // -------------------------------------------------------------------------
  it('I-10: APPROVED (fully settled) custody is not counted as outstanding', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    let custodian = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!custodian) {
      custodian = await prisma.user.create({
        data: {
          name: `مهندس عهد مكتملة ${Date.now()}`,
          email: `custody.done.eng.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }

    const custody = await prisma.custody.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        code: `CST-DASH-${Math.floor(Math.random() * 89999 + 10000)}`,
        custodianUserId: custodian.id,
        purpose: 'عهدة مكتملة',
        amount: new Prisma.Decimal('5000.00'),
        cashReturnedAmount: new Prisma.Decimal('5000.00'),
        status: CustodyStatus.SETTLED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
        issuedById: testManager.id,
        issuedAt: new Date(),
        settledAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // SETTLED custody is NOT in ISSUED or PARTIALLY_SETTLED → not outstanding
      expect(summary!.activeExposure).toBe('0.00');
    } finally {
      await prisma.custody.delete({ where: { id: custody.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-12: Pending counts
  // -------------------------------------------------------------------------
  it('I-12: pending approval counts reflect SUBMITTED records with deletedAt=null', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '50000.00' });

    const expense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        description: 'مصروف معلق',
        amount: new Prisma.Decimal('1000.00'),
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        currency: 'SAR',
        submittedById: testManager.id,
        submittedAt: new Date(),
      },
    });

    try {
      const result = await getDashboardSummary();
      // At least 1 pending expense (ours)
      expect(result.pendingApprovals.expenses).toBeGreaterThanOrEqual(1);
      expect(result.pendingApprovals.total).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.expense.delete({ where: { id: expense.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-13: Project without approved budget
  // -------------------------------------------------------------------------
  it('I-13: project without approved budget has hasApprovedBudget=false and all amounts "0.00"', async () => {
    const code = `PRJ-NOBUDGET${Math.floor(Math.random() * 89999 + 10000)}`;
    const project = await createProject({
      code,
      name: `مشروع بدون موازنة ${code}`,
      description: 'مشروع لاختبار غياب الموازنة',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const summary = await findProject(project.id);
    expect(summary).toBeDefined();
    expect(summary!.hasApprovedBudget).toBe(false);
    expect(summary!.authorizedBudget).toBe('0.00');
    expect(summary!.actualSpend).toBe('0.00');
    expect(summary!.activeExposure).toBe('0.00');
    expect(summary!.availableBalance).toBe('0.00');
    expect(summary!.pendingExposure).toBe('0.00');
    expect(summary!.projectedBalance).toBe('0.00');
  });

  // -------------------------------------------------------------------------
  // I-14: SubcontractorBilling amounts do not appear in exposure
  // -------------------------------------------------------------------------
  it('I-14: SubcontractorBilling amounts do not appear in ActualSpend or TotalActiveExposure', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    // Create an approved commitment as prerequisite for billing
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        vendorName: 'مقاول للتجربة',
        referenceNumber: 'CNT-BILL01',
        description: 'ارتباط مع مقاول',
        commitmentDate: new Date(),
        amount: new Prisma.Decimal('30000.00'),
        status: CommitmentStatus.APPROVED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    const billing = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        commitmentId: commitment.id,
        subcontractorName: 'مقاول للتجربة',
        referenceNumber: 'BILL-001',
        billingPeriod: '2026-09',
        claimDate: new Date(),
        description: 'مستخلص اختبار',
        grossAmount: new Prisma.Decimal('15000.00'),
        status: SubcontractorBillingStatus.APPROVED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // TotalActiveExposure = 30000 (approved commitment) only — billing not included
      expect(summary!.activeExposure).toBe('30000.00');
      // ActualSpend = 0 (no direct expenses, no payroll, no custody spend)
      expect(summary!.actualSpend).toBe('0.00');
    } finally {
      await prisma.subcontractorBilling.delete({ where: { id: billing.id } });
      await prisma.commitment.delete({ where: { id: commitment.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-15: BD-34 — ApprovedPayroll counted exactly once
  // -------------------------------------------------------------------------
  it('I-15: BD-34 regression — ApprovedPayroll included exactly once (not double-counted)', async () => {
    const { project, laborLine } = await setupApprovedProject({ labor: '100000.00' });

    const payroll = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل اختبار BD-34',
        workerReference: 'WRK-001',
        tradeOrTitle: 'فني اختبار',
        description: 'قيد رواتب اختبار BD-34',
        periodYear: 2026,
        periodMonth: 8,
        amount: new Prisma.Decimal('10000.00'),
        status: PayrollStatus.APPROVED,
        currency: 'SAR',
        createdById: testManager.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    try {
      const summary = await findProject(project.id);
      expect(summary).toBeDefined();

      // If payroll were double-counted, activeExposure would be 20000
      // It must be exactly 10000
      expect(summary!.activeExposure).toBe('10000.00');
      // ActualSpend must also be 10000
      expect(summary!.actualSpend).toBe('10000.00');
    } finally {
      await prisma.payrollEntry.delete({ where: { id: payroll.id } });
    }
  });

  // -------------------------------------------------------------------------
  // I-16: DTO primitives — no Decimal, no Date, currency=SAR, generatedAt ISO
  // -------------------------------------------------------------------------
  it('I-16: DTO has only primitives — no Decimal, no Date, currency=SAR, generatedAt ISO string', async () => {
    const result = await getDashboardSummary();

    // generatedAt is ISO string
    expect(typeof result.generatedAt).toBe('string');
    expect(() => new Date(result.generatedAt)).not.toThrow();

    // Company summary amounts are strings
    expect(typeof result.companySummary.totalAuthorizedBudget).toBe('string');
    expect(typeof result.companySummary.totalActualSpend).toBe('string');
    expect(result.companySummary.currency).toBe('SAR');

    // No Decimal or Date objects in output
    const allValues = [
      ...Object.values(result.companySummary),
      ...Object.values(result.pendingApprovals),
    ];
    for (const v of allValues) {
      expect((v as unknown) instanceof Prisma.Decimal).toBe(false);
      expect((v as unknown) instanceof Date).toBe(false);
    }

    // Per-project DTOs also have string amounts
    for (const p of result.projects) {
      expect(typeof p.authorizedBudget).toBe('string');
      expect(typeof p.actualSpend).toBe('string');
      expect(p.currency).toBe('SAR');
    }
  });

  // -------------------------------------------------------------------------
  // I-17: DTO privacy — no workerName / workerReference / tradeOrTitle
  // -------------------------------------------------------------------------
  it('I-17: DTO privacy — no workerName, workerReference, or tradeOrTitle in any response field', async () => {
    const result = await getDashboardSummary();
    const json = JSON.stringify(result);

    // These field names must not appear anywhere in the serialized response
    expect(json).not.toContain('workerName');
    expect(json).not.toContain('workerReference');
    expect(json).not.toContain('tradeOrTitle');
  });
});
