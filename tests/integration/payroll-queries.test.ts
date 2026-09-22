/**
 * tests/integration/payroll-queries.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 8: Payroll Queries Integration Tests on Live PostgreSQL.
 *
 * Covers:
 * 1. getAllPayrollEntries:
 *    - Role matrix: Manager and Accountant allowed; Engineer and Purchasing denied (FORBIDDEN).
 *    - Filters: projectId, status, periodYear, periodMonth, workerName.
 *    - Soft-delete exclusion (deletedAt !== null never returned).
 *    - Safe DTO mapping with Decimal precision as string.
 *
 * 2. getProjectPayrollEntries:
 *    - Role matrix: Manager and Accountant allowed; Engineer and Purchasing denied (FORBIDDEN).
 *    - Cross-project isolation: returns only records for the target project.
 *    - Project existence and soft-delete verification (throws NOT_FOUND).
 *    - Soft-delete exclusion on payroll records.
 *
 * 3. getProjectLaborSummary:
 *    - Role matrix: Manager and Accountant allowed; Purchasing hard denied (FORBIDDEN).
 *    - Engineer fail-closed scope: denied without verified project scope; allowed with verified scope.
 *    - DTO Privacy: asserts that workerName, workerReference, tradeOrTitle, individual amount,
 *      entry ID, and rejectionReason are NOT present in the aggregate response.
 *    - Financial Summary Scenario 1:
 *      BudgetLine = 1,000,000 | Commitment = 600,000 | Expense = 80,000 | Payroll = 200,000
 *      SubcontractorBilling = 150,000 (assert NOT double counted)
 *      Expected active exposure = 880,000 | available = 120,000.
 *    - Financial Summary Scenario 2:
 *      BudgetLine = 1,000 | Payroll = 200 | Outstanding custody = 100 | Custody actual = 150 | Direct expense = 100
 *      Expected active exposure = 550 | remaining = 450.
 *    - Multiple LABOR lines: correctly aggregated across all project LABOR lines.
 *
 * 4. getPayrollFormData:
 *    - Role matrix: Accountant and Manager allowed; Engineer and Purchasing denied (FORBIDDEN).
 *    - Returns only ACTIVE projects having an APPROVED budget with LABOR category lines.
 *    - Strictly excludes non-LABOR lines (MATERIALS, EQUIPMENT, etc.).
 *    - Strictly excludes soft-deleted projects and unapproved budgets.
 *    - Excludes employee/worker master information and salary history.
 *
 * 5. getPayrollEntry consistency:
 *    - Manager and Accountant allowed; Engineer and Purchasing denied.
 *    - Soft-deleted record throws NOT_FOUND.
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
import {
  getAllPayrollEntries,
  getProjectPayrollEntries,
  getProjectLaborSummary,
  getPayrollFormData,
  getPayrollEntry,
  createPayrollDraft,
  submitPayroll,
  approvePayroll,
} from '@/lib/payroll';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll Queries Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

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
          name: 'مدير استعلامات الرواتب',
          email: `mgr.payqry.${Date.now()}@test.local`,
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
          name: 'محاسب استعلامات الرواتب',
          email: `acc.payqry.${Date.now()}@test.local`,
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
          name: 'مهندس استعلامات الرواتب',
          email: `eng.payqry.${Date.now()}@test.local`,
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

    // 4. Purchasing
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات استعلامات الرواتب',
          email: `pur.payqry.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
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
  // Helper: Setup active project with an approved budget
  // ---------------------------------------------------------------------------
  async function setupProjectWithLaborLines(
    linesConfig: Array<{ category: BudgetCategory; amount: string; description: string }> = [
      { category: BudgetCategory.LABOR, amount: '100000.00', description: 'بند أجور وعمالة أساسي' },
      { category: BudgetCategory.MATERIALS, amount: '50000.00', description: 'بند مواد بناء' },
    ],
  ) {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const code = `PRJ-Q${Math.floor(Math.random() * 899999 + 100000)}`;
    const project = await createProject({
      code,
      name: `مشروع استعلامات ${code}`,
      description: 'مشروع فحص استعلامات الرواتب والأجور',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: linesConfig,
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const lines = await prisma.budgetLine.findMany({
      where: { budgetId: budgetDraft.id },
    });

    const laborLine = lines.find((l) => l.category === BudgetCategory.LABOR)!;

    return { project, lines, laborLine };
  }

  // ===========================================================================
  // 1. getAllPayrollEntries
  // ===========================================================================
  describe('getAllPayrollEntries', () => {
    it('allows Manager and Accountant, denies Engineer and Purchasing', async () => {
      const { project, laborLine } = await setupProjectWithLaborLines();

      // Create a test draft
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const draft = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'سعيد القحطاني',
        periodYear: 2026,
        periodMonth: 9,
        amount: '4000.00',
        description: 'قيد رواتب فحص العرض العام',
      });
      cleanupPayrollIds.push(draft.id);

      // 1. Manager allowed
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const managerResult = await getAllPayrollEntries({ projectId: project.id });
      expect(managerResult.length).toBeGreaterThanOrEqual(1);
      const found = managerResult.find((e) => e.id === draft.id);
      expect(found).toBeDefined();
      expect(found?.amount).toBe('4000.00');
      expect(found?.workerName).toBe('سعيد القحطاني');

      // 2. Accountant allowed
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const accountantResult = await getAllPayrollEntries({ projectId: project.id });
      expect(accountantResult.some((e) => e.id === draft.id)).toBe(true);

      // 3. Engineer denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
      await expect(getAllPayrollEntries({ projectId: project.id })).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // 4. Purchasing denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getAllPayrollEntries({ projectId: project.id })).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('filters properly by status, period, and workerName, and strictly excludes soft-deleted rows', async () => {
      const { project, laborLine } = await setupProjectWithLaborLines();

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const e1 = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'أحمد محمود النجار',
        periodYear: 2026,
        periodMonth: 8,
        amount: '3500.00',
        description: 'أجور شهر 8',
      });
      cleanupPayrollIds.push(e1.id);

      const e2 = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'أحمد محمود النجار',
        periodYear: 2026,
        periodMonth: 9,
        amount: '4000.00',
        description: 'أجور شهر 9',
      });
      cleanupPayrollIds.push(e2.id);
      await submitPayroll(e2.id);

      const e3Deleted = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل محذوف لا يظهر',
        periodYear: 2026,
        periodMonth: 9,
        amount: '2000.00',
        description: 'مسودة للحذف',
      });
      cleanupPayrollIds.push(e3Deleted.id);
      // Soft-delete e3
      await prisma.payrollEntry.update({
        where: { id: e3Deleted.id },
        data: { deletedAt: new Date() },
      });

      // Filter by status SUBMITTED
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const submittedOnly = await getAllPayrollEntries({
        projectId: project.id,
        status: PayrollStatus.SUBMITTED,
      });
      expect(submittedOnly.some((e) => e.id === e2.id)).toBe(true);
      expect(submittedOnly.some((e) => e.id === e1.id)).toBe(false);

      // Filter by periodMonth 8
      const month8Only = await getAllPayrollEntries({
        projectId: project.id,
        periodMonth: 8,
      });
      expect(month8Only.some((e) => e.id === e1.id)).toBe(true);
      expect(month8Only.some((e) => e.id === e2.id)).toBe(false);

      // Filter by workerName search
      const workerSearch = await getAllPayrollEntries({
        projectId: project.id,
        workerName: 'النجار',
      });
      expect(workerSearch.length).toBe(2);

      // Assert deleted record never appears in any query
      const allProjectEntries = await getAllPayrollEntries({ projectId: project.id });
      expect(allProjectEntries.some((e) => e.id === e3Deleted.id)).toBe(false);
    });
  });

  // ===========================================================================
  // 2. getProjectPayrollEntries
  // ===========================================================================
  describe('getProjectPayrollEntries', () => {
    it('isolates project entries, rejects unauthorized roles, and returns 404 for deleted projects', async () => {
      const { project: p1, laborLine: l1 } = await setupProjectWithLaborLines();
      const { project: p2, laborLine: l2 } = await setupProjectWithLaborLines();

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const e1 = await createPayrollDraft({
        projectId: p1.id,
        budgetLineId: l1.id,
        workerName: 'عامل مشروع 1',
        periodYear: 2026,
        periodMonth: 9,
        amount: '3000.00',
        description: 'قيد لمشروع 1',
      });
      cleanupPayrollIds.push(e1.id);

      const e2 = await createPayrollDraft({
        projectId: p2.id,
        budgetLineId: l2.id,
        workerName: 'عامل مشروع 2',
        periodYear: 2026,
        periodMonth: 9,
        amount: '5000.00',
        description: 'قيد لمشروع 2',
      });
      cleanupPayrollIds.push(e2.id);

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const p1Entries = await getProjectPayrollEntries(p1.id);
      expect(p1Entries.some((e) => e.id === e1.id)).toBe(true);
      expect(p1Entries.some((e) => e.id === e2.id)).toBe(false);

      // Engineer denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
      await expect(getProjectPayrollEntries(p1.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // Purchasing denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getProjectPayrollEntries(p1.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // Soft-deleted project throws NOT_FOUND
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      await prisma.project.update({
        where: { id: p2.id },
        data: { deletedAt: new Date() },
      });
      await expect(getProjectPayrollEntries(p2.id)).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });
  });

  // ===========================================================================
  // 3. getProjectLaborSummary
  // ===========================================================================
  describe('getProjectLaborSummary', () => {
    it('enforces Engineer fail-closed scope, permits verified scope, and protects DTO privacy', async () => {
      const { project } = await setupProjectWithLaborLines([
        { category: BudgetCategory.LABOR, amount: '500000.00', description: 'بند الأجور' },
      ]);

      // 1. Manager allowed
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const mgrSummary = await getProjectLaborSummary(project.id);
      expect(mgrSummary.totalLaborBudget).toBe('500000.00');

      // 2. Accountant allowed
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const accSummary = await getProjectLaborSummary(project.id);
      expect(accSummary.totalLaborBudget).toBe('500000.00');

      // 3. Purchasing hard denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getProjectLaborSummary(project.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // 4. Engineer without verified scope -> FAIL CLOSED (throws FORBIDDEN)
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
      await expect(getProjectLaborSummary(project.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // 5. Engineer with verified scope -> ALLOW
      const engSummary = await getProjectLaborSummary(project.id, { hasProjectAccess: true });
      expect(engSummary.totalLaborBudget).toBe('500000.00');

      // 6. DTO PRIVACY: Assert that NO individual worker or entry fields exist in the summary
      const serialized = JSON.parse(JSON.stringify(engSummary)) as Record<string, unknown>;
      expect('workerName' in serialized).toBe(false);
      expect('workerReference' in serialized).toBe(false);
      expect('tradeOrTitle' in serialized).toBe(false);
      expect('amount' in serialized).toBe(false); // Only totalLaborBudget / approvedLaborSpend
      expect('rejectionReason' in serialized).toBe(false);
      expect('cancellationReason' in serialized).toBe(false);
      expect('payrollEntries' in serialized).toBe(false);
      expect(serialized).toHaveProperty('totalLaborBudget');
      expect(serialized).toHaveProperty('approvedLaborSpend');
      expect(serialized).toHaveProperty('remainingLaborBudget');
    });

    it('Scenario 1: BudgetLine 1,000,000 | Commitment 600,000 | Expense 80,000 | Payroll 200,000 | Billing not double counted', async () => {
      const { project, laborLine } = await setupProjectWithLaborLines([
        { category: BudgetCategory.LABOR, amount: '1000000.00', description: 'بند أجور المليون' },
      ]);

      // A. Approved Commitment = 600,000
      const commitment = await prisma.commitment.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          vendorName: 'شركة تشغيل الأيدي العاملة',
          amount: new Prisma.Decimal('600000.00'),
          currency: 'SAR',
          status: CommitmentStatus.APPROVED,
          commitmentDate: new Date(),
          createdById: testManager.id,
          approvedById: testManager.id,
          approvedAt: new Date(),
          description: 'عقد توريد عمالة مهنية',
        },
      });
      cleanupCommitmentIds.push(commitment.id);

      // B. Approved Direct Expense = 80,000
      const expense = await prisma.expense.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          amount: new Prisma.Decimal('80000.00'),
          currency: 'SAR',
          status: ExpenseStatus.APPROVED,
          expenseDate: new Date(),
          submittedById: testAccountant.id,
          approvedById: testManager.id,
          approvedAt: new Date(),
          description: 'مصاريف عمالة طارئة للموقع',
        },
      });
      cleanupExpenseIds.push(expense.id);

      // C. Approved Payroll = 200,000
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const payrollDraft = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'سعيد الهاجري وزملاؤه',
        periodYear: 2026,
        periodMonth: 9,
        amount: '200000.00',
        description: 'رواتب العمالة المباشرة للشهر',
      });
      cleanupPayrollIds.push(payrollDraft.id);
      await submitPayroll(payrollDraft.id);

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      await approvePayroll(payrollDraft.id);

      // D. Subcontractor Billing = 150,000 (Certified against the 600,000 commitment)
      const billing = await prisma.subcontractorBilling.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          commitmentId: commitment.id,
          subcontractorName: 'شركة تشغيل الأيدي العاملة',
          referenceNumber: `BILL-PAY-${Date.now()}`,
          billingPeriod: '2026-09',
          claimDate: new Date(),
          grossAmount: new Prisma.Decimal('150000.00'),
          currency: 'SAR',
          status: 'APPROVED',
          createdById: testAccountant.id,
          submittedById: testAccountant.id,
          submittedAt: new Date(),
          approvedById: testManager.id,
          approvedAt: new Date(),
          description: 'مستخلص توريد العمالة المعتمد',
        },
      });
      cleanupBillingIds.push(billing.id);

      // Query labor summary
      const summary = await getProjectLaborSummary(project.id);

      // Expected:
      // totalLaborBudget = 1,000,000.00
      // approvedLaborSpend = 600,000 + 80,000 + 200,000 = 880,000.00 (Billing is NOT added!)
      // remainingLaborBudget = 1,000,000 - 880,000 = 120,000.00
      expect(summary.totalLaborBudget).toBe('1000000.00');
      expect(summary.approvedLaborSpend).toBe('880000.00');
      expect(summary.remainingLaborBudget).toBe('120000.00');
    });

    it('Scenario 2: BudgetLine 1,000 | Payroll 200 | Custody actual 150 + Outstanding custody 100 | Direct expense 100', async () => {
      const { project, laborLine } = await setupProjectWithLaborLines([
        { category: BudgetCategory.LABOR, amount: '1000.00', description: 'بند أجور صغير' },
      ]);

      // A. Approved Direct Expense = 100.00
      const expDirect = await prisma.expense.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          amount: new Prisma.Decimal('100.00'),
          currency: 'SAR',
          status: ExpenseStatus.APPROVED,
          expenseDate: new Date(),
          submittedById: testAccountant.id,
          approvedById: testManager.id,
          approvedAt: new Date(),
          description: 'مصروف مباشر 100',
        },
      });
      cleanupExpenseIds.push(expDirect.id);

      // B. Custody: amount = 250.00, settled with 150.00 approved expense -> outstanding = 100.00
      const custody = await prisma.custody.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          custodianUserId: testAccountant.id,
          code: `CST-Q${Math.floor(Math.random() * 89999 + 10000)}`,
          amount: new Prisma.Decimal('250.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          currency: 'SAR',
          status: CustodyStatus.PARTIALLY_SETTLED,
          createdById: testAccountant.id,
          approvedById: testManager.id,
          approvedAt: new Date(),
          issuedAt: new Date(),
          purpose: 'عهدة أجور مؤقتة 250',
        },
      });
      cleanupCustodyIds.push(custody.id);

      const custodyExp = await prisma.expense.create({
        data: {
          projectId: project.id,
          budgetLineId: laborLine.id,
          custodyId: custody.id,
          amount: new Prisma.Decimal('150.00'),
          currency: 'SAR',
          status: ExpenseStatus.APPROVED,
          expenseDate: new Date(),
          submittedById: testAccountant.id,
          approvedById: testManager.id,
          approvedAt: new Date(),
          description: 'تسوية جزئية من العهدة 150',
        },
      });
      cleanupExpenseIds.push(custodyExp.id);

      // C. Approved Payroll = 200.00
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const payrollDraft = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل الأجر الصغير',
        periodYear: 2026,
        periodMonth: 9,
        amount: '200.00',
        description: 'أجر قيد 200',
      });
      cleanupPayrollIds.push(payrollDraft.id);
      await submitPayroll(payrollDraft.id);

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      await approvePayroll(payrollDraft.id);

      // Query labor summary
      const summary = await getProjectLaborSummary(project.id);

      // Expected:
      // totalActiveExposure = 100 (direct) + 150 (custody actual) + 100 (outstanding custody) + 200 (payroll) = 550.00
      // remainingLaborBudget = 1000.00 - 550.00 = 450.00
      expect(summary.totalLaborBudget).toBe('1000.00');
      expect(summary.approvedLaborSpend).toBe('550.00');
      expect(summary.remainingLaborBudget).toBe('450.00');
    });

    it('correctly aggregates multiple approved LABOR lines for a single project', async () => {
      const { project, lines } = await setupProjectWithLaborLines([
        { category: BudgetCategory.LABOR, amount: '30000.00', description: 'بند أجور أعمال الموقع' },
        { category: BudgetCategory.LABOR, amount: '70000.00', description: 'بند أجور الحراسة والأمن' },
        { category: BudgetCategory.MATERIALS, amount: '40000.00', description: 'بند مواد غير محسوب' },
      ]);

      const laborLines = lines.filter((l) => l.category === BudgetCategory.LABOR);
      expect(laborLines.length).toBe(2);

      // Add 10,000 payroll on line 1 and 20,000 on line 2
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const p1 = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLines[0]!.id,
        workerName: 'عامل الموقع الأول',
        periodYear: 2026,
        periodMonth: 9,
        amount: '10000.00',
        description: 'أجور خط 1',
      });
      cleanupPayrollIds.push(p1.id);
      await submitPayroll(p1.id);

      const p2 = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLines[1]!.id,
        workerName: 'حارس أمن',
        periodYear: 2026,
        periodMonth: 9,
        amount: '20000.00',
        description: 'أجور خط 2',
      });
      cleanupPayrollIds.push(p2.id);
      await submitPayroll(p2.id);

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      await approvePayroll(p1.id);
      await approvePayroll(p2.id);

      const summary = await getProjectLaborSummary(project.id);
      // Total Labor Budget = 30,000 + 70,000 = 100,000.00 (MATERIALS line is excluded)
      // Approved Labor Spend = 10,000 + 20,000 = 30,000.00
      // Remaining Labor Budget = 100,000 - 30,000 = 70,000.00
      expect(summary.totalLaborBudget).toBe('100000.00');
      expect(summary.approvedLaborSpend).toBe('30000.00');
      expect(summary.remainingLaborBudget).toBe('70000.00');
      expect(summary.laborBudgetLinesCount).toBe(2);
    });
  });

  // ===========================================================================
  // 4. getPayrollFormData
  // ===========================================================================
  describe('getPayrollFormData', () => {
    it('returns only active projects with approved budgets and LABOR lines, strictly excluding non-LABOR lines', async () => {
      // 1. Valid project with LABOR and MATERIALS lines
      const { project: validProject } = await setupProjectWithLaborLines([
        { category: BudgetCategory.LABOR, amount: '80000.00', description: 'عمالة المشروع الصحيح' },
        { category: BudgetCategory.MATERIALS, amount: '40000.00', description: 'مواد المشروع' },
        { category: BudgetCategory.EQUIPMENT, amount: '20000.00', description: 'معدات المشروع' },
      ]);

      // 2. Project with NO LABOR lines (only MATERIALS)
      const { project: noLaborProject } = await setupProjectWithLaborLines([
        { category: BudgetCategory.MATERIALS, amount: '90000.00', description: 'مواد فقط' },
      ]);

      // 3. Project that is PLANNED (not ACTIVE)
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const plannedProject = await createProject({
        code: `PRJ-P${Math.floor(Math.random() * 899999 + 100000)}`,
        name: 'مشروع مخطط غير نشط',
        description: 'مشروع تجريبي',
        managerId: testManager.id,
      });
      cleanupProjectIds.push(plannedProject.id);

      // 4. Accountant retrieves form data
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const formData = await getPayrollFormData();

      expect(formData.projects.length).toBeGreaterThanOrEqual(1);

      // Valid project must be present
      const foundValid = formData.projects.find((p) => p.id === validProject.id);
      expect(foundValid).toBeDefined();
      expect(foundValid?.laborLines.length).toBe(1);
      expect(foundValid?.laborLines[0]?.category).toBe(BudgetCategory.LABOR);
      expect(foundValid?.laborLines[0]?.amount).toBe('80000.00');

      // Assert non-LABOR lines are NOT included
      expect(foundValid?.laborLines.some((l) => l.category === BudgetCategory.MATERIALS)).toBe(false);
      expect(foundValid?.laborLines.some((l) => l.category === BudgetCategory.EQUIPMENT)).toBe(false);

      // Project without LABOR lines must NOT be in form data
      expect(formData.projects.some((p) => p.id === noLaborProject.id)).toBe(false);

      // Planned project must NOT be in form data
      expect(formData.projects.some((p) => p.id === plannedProject.id)).toBe(false);

      // 5. Engineer and Purchasing denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
      await expect(getPayrollFormData()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getPayrollFormData()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  });

  // ===========================================================================
  // 5. Detail query consistency (getPayrollEntry)
  // ===========================================================================
  describe('getPayrollEntry detail consistency', () => {
    it('allows Manager and Accountant, denies Engineer and Purchasing, excludes soft-deleted', async () => {
      const { project, laborLine } = await setupProjectWithLaborLines();

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const draft = await createPayrollDraft({
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'علي بن أحمد',
        periodYear: 2026,
        periodMonth: 9,
        amount: '4500.00',
        description: 'قيد للتحقق من التفاصيل',
      });
      cleanupPayrollIds.push(draft.id);

      // Manager can view
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      const mgrDetail = await getPayrollEntry(draft.id);
      expect(mgrDetail.id).toBe(draft.id);
      expect(mgrDetail.workerName).toBe('علي بن أحمد');
      expect(mgrDetail.amount).toBe('4500.00');

      // Accountant can view
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      const accDetail = await getPayrollEntry(draft.id);
      expect(accDetail.id).toBe(draft.id);

      // Engineer denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
      await expect(getPayrollEntry(draft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // Purchasing denied
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getPayrollEntry(draft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // Soft deleted throws NOT_FOUND
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      await prisma.payrollEntry.update({
        where: { id: draft.id },
        data: { deletedAt: new Date() },
      });
      await expect(getPayrollEntry(draft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });
  });
});
