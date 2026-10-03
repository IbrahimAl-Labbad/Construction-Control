/**
 * tests/unit/lib/canonical-budget-exposure-d1.test.ts
 *
 * Dedicated regression tests for Refactoring Phase 2 (D1):
 * Proves canonical budget-line exposure formula is authoritative across:
 * 1. Commitments overview (getProjectCommitments)
 * 2. Expenses overview (getProjectExpenses)
 * 3. Custody totals (calculateUserCustodiesTotals)
 * 4. Payroll exposure inclusion in available balance
 * 5. Outstanding custody exposure inclusion in available balance
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BudgetCategory,
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  Role,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import * as permissions from '@/lib/permissions';
import { getProjectCommitments } from '@/lib/commitments/queries/get-project-commitments';
import { getProjectExpenses } from '@/lib/expenses/queries/get-project-expenses';
import { getProjectCustodies } from '@/lib/custodies/queries/get-project-custodies';
import { calculateUserCustodiesTotals } from '@/lib/custodies/calculations';

describe('Phase 2 — D1: Canonical Budget Exposure Consistency', () => {
  const testManager = {
    id: 'user-manager-d1',
    name: 'المدير العام',
    email: 'manager@example.com',
    role: Role.MANAGER,
    isActive: true,
  };

  const mockProjectId = 'project-d1-test';
  const mockBudgetLineId = 'line-materials-d1';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager as never);
  });

  it('proves getProjectCommitments includes approved expenses, custodies, and payroll in canonical totalExposure and availableBalance', async () => {
    // 1. Mock project
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      id: mockProjectId,
      name: 'مشروع الأبراج السكنية',
      code: 'PRJ-D1-01',
      status: 'ACTIVE',
    } as never);

    // 2. Mock budget with 100,000 SAR ceiling
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      id: 'budget-d1',
      projectId: mockProjectId,
      status: BudgetStatus.APPROVED,
      lines: [
        {
          id: mockBudgetLineId,
          budgetId: 'budget-d1',
          category: BudgetCategory.MATERIALS,
          description: 'توريدات مواد البناء والخرسانة',
          amount: new Prisma.Decimal('100000.00'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as never);

    // 3. Mock commitments: 20,000 approved, 5,000 submitted
    vi.spyOn(prisma.commitment, 'findMany').mockResolvedValue([
      {
        id: 'comm-1',
        projectId: mockProjectId,
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('20000.00'),
        status: CommitmentStatus.APPROVED,
        vendorName: 'مورد الحديد',
        description: 'حديد تسليح',
        commitmentDate: new Date(),
        referenceNumber: 'PO-01',
        createdById: testManager.id,
        createdBy: testManager,
        submittedById: testManager.id,
        submittedBy: testManager,
        approvedById: testManager.id,
        approvedBy: testManager,
        rejectedById: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        submittedAt: new Date(),
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'comm-2',
        projectId: mockProjectId,
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('5000.00'),
        status: CommitmentStatus.SUBMITTED,
        vendorName: 'مورد الخرسانة',
        description: 'خرسانة جاهزة',
        commitmentDate: new Date(),
        referenceNumber: 'PO-02',
        createdById: testManager.id,
        createdBy: testManager,
        submittedById: testManager.id,
        submittedBy: testManager,
        approvedById: null,
        approvedBy: null,
        rejectedById: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        submittedAt: new Date(),
        approvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ] as never);

    // 4. Mock expenses: 10,000 direct approved, 5,000 custody approved
    vi.spyOn(prisma.expense, 'findMany').mockResolvedValue([
      {
        id: 'exp-1',
        budgetLineId: mockBudgetLineId,
        custodyId: null,
        amount: new Prisma.Decimal('10000.00'),
        status: ExpenseStatus.APPROVED,
      },
      {
        id: 'exp-2',
        budgetLineId: mockBudgetLineId,
        custodyId: 'custody-1',
        amount: new Prisma.Decimal('5000.00'),
        status: ExpenseStatus.APPROVED,
      },
    ] as never);

    // 5. Mock custody: 12,000 issued, 5,000 settled (exp-2 above), 0 returned => outstanding 7,000
    vi.spyOn(prisma.custody, 'findMany').mockResolvedValue([
      {
        id: 'custody-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('12000.00'),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        status: CustodyStatus.PARTIALLY_SETTLED,
        expenses: [{ id: 'exp-2', amount: new Prisma.Decimal('5000.00'), status: ExpenseStatus.APPROVED }],
      },
    ] as never);

    // 6. Mock payroll: 8,000 approved, 2,000 submitted
    vi.spyOn(prisma.payrollEntry, 'findMany').mockResolvedValue([
      {
        id: 'pay-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('8000.00'),
        status: PayrollStatus.APPROVED,
      },
      {
        id: 'pay-2',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('2000.00'),
        status: PayrollStatus.SUBMITTED,
      },
    ] as never);

    const result = await getProjectCommitments(mockProjectId);

    // Invariant verification:
    // Total Active Exposure = ApprovedCommitments (20k)
    //                       + DirectExpenses (10k)
    //                       + CustodyExpenses (5k)
    //                       + OutstandingCustodies (7k)
    //                       + ApprovedPayroll (8k)
    //                       = 50,000.00 SAR
    expect(result.totalAuthorizedBudget).toBe('100000.00');
    expect(result.totalExposure).toBe('50000.00');
    expect(result.totalAvailableBalance).toBe('50000.00'); // 100k - 50k = 50k

    // Total Pending Exposure = PendingCommitments (5k) + PendingPayroll (2k) = 7,000.00
    expect(result.totalPendingCommitmentExposure).toBe('5000.00');
    expect(result.totalPendingExposure).toBe('7000.00');
    expect(result.totalProjectedBalance).toBe('43000.00'); // 50k - 7k = 43k

    // Breakdown line checks
    const line = result.lines[0]!;
    expect(line.approvedCommitments).toBe('20000.00');
    expect(line.approvedExpenses).toBe('15000.00'); // 10k direct + 5k custody
    expect(line.totalExposure).toBe('50000.00');
    expect(line.availableBalance).toBe('50000.00');
    expect(line.totalPendingExposure).toBe('7000.00');
    expect(line.projectedBalance).toBe('43000.00');
  });

  it('proves getProjectExpenses includes commitments, custodies, and payroll in canonical availableBalance', async () => {
    // 1. Mock project
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      id: mockProjectId,
      name: 'مشروع الأبراج السكنية',
      code: 'PRJ-D1-01',
      status: 'ACTIVE',
    } as never);

    // 2. Mock budget with 100,000 SAR ceiling
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      id: 'budget-d1',
      projectId: mockProjectId,
      status: BudgetStatus.APPROVED,
      lines: [
        {
          id: mockBudgetLineId,
          budgetId: 'budget-d1',
          category: BudgetCategory.MATERIALS,
          description: 'توريدات مواد البناء والخرسانة',
          amount: new Prisma.Decimal('100000.00'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as never);

    // 3. Mock expenses: 15,000 approved, 4,000 submitted
    vi.spyOn(prisma.expense, 'findMany').mockResolvedValue([
      {
        id: 'exp-1',
        projectId: mockProjectId,
        budgetLineId: mockBudgetLineId,
        custodyId: null,
        amount: new Prisma.Decimal('15000.00'),
        status: ExpenseStatus.APPROVED,
        description: 'دفعة أسمنت',
        expenseDate: new Date(),
        submittedById: testManager.id,
        submittedBy: testManager,
        approvedById: testManager.id,
        approvedBy: testManager,
        rejectedById: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'exp-2',
        projectId: mockProjectId,
        budgetLineId: mockBudgetLineId,
        custodyId: null,
        amount: new Prisma.Decimal('4000.00'),
        status: ExpenseStatus.SUBMITTED,
        description: 'دفعة رمل',
        expenseDate: new Date(),
        submittedById: testManager.id,
        submittedBy: testManager,
        approvedById: null,
        approvedBy: null,
        rejectedById: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    // 4. Mock commitments: 25,000 approved, 5,000 submitted
    vi.spyOn(prisma.commitment, 'findMany').mockResolvedValue([
      {
        id: 'comm-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('25000.00'),
        status: CommitmentStatus.APPROVED,
      },
      {
        id: 'comm-2',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('5000.00'),
        status: CommitmentStatus.SUBMITTED,
      },
    ] as never);

    // 5. Mock custodies: 10,000 issued (all unspent outstanding)
    vi.spyOn(prisma.custody, 'findMany').mockResolvedValue([
      {
        id: 'custody-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('10000.00'),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        status: CustodyStatus.ISSUED,
        expenses: [],
      },
    ] as never);

    // 6. Mock payroll: 10,000 approved
    vi.spyOn(prisma.payrollEntry, 'findMany').mockResolvedValue([
      {
        id: 'pay-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('10000.00'),
        status: PayrollStatus.APPROVED,
      },
    ] as never);

    const result = await getProjectExpenses(mockProjectId);

    // Canonical calculations:
    // Total Active Exposure = 15k (actual expenses) + 25k (commitments) + 10k (outstanding custody) + 10k (payroll) = 60,000.00
    // Available Balance = 100k - 60k = 40,000.00 (NOT 85,000 as before!)
    expect(result.totalAuthorizedBudget).toBe('100000.00');
    expect(result.totalActualSpend).toBe('15000.00');
    expect(result.totalAvailableBalance).toBe('40000.00');

    // Total Pending Exposure = 4k (pending expenses) + 5k (pending commitments) = 9,000.00
    expect(result.totalPendingExposure).toBe('9000.00');
    expect(result.totalProjectedBalance).toBe('31000.00'); // 40k - 9k = 31k

    const line = result.lines[0]!;
    expect(line.actualSpend).toBe('15000.00');
    expect(line.availableBalance).toBe('40000.00');
    expect(line.pendingExposure).toBe('9000.00');
    expect(line.projectedBalance).toBe('31000.00');
  });

  it('proves calculateUserCustodiesTotals accurately calculates totals using exact Decimal arithmetic without floats', () => {
    const custodies = [
      {
        status: CustodyStatus.ISSUED,
        amount: '10000.00',
        settledExpensesAmount: '3500.25',
        cashReturnedAmount: '0.00',
        remainingBalance: '6499.75',
      },
      {
        status: CustodyStatus.PARTIALLY_SETTLED,
        amount: '5000.00',
        settledExpensesAmount: '3000.00',
        cashReturnedAmount: '1000.50',
        remainingBalance: '999.50',
      },
      {
        status: CustodyStatus.DRAFT,
        amount: '2000.00',
        settledExpensesAmount: '0.00',
        cashReturnedAmount: '0.00',
        remainingBalance: '2000.00',
      },
      {
        status: CustodyStatus.SUBMITTED,
        amount: '3000.00',
        settledExpensesAmount: '0.00',
        cashReturnedAmount: '0.00',
        remainingBalance: '3000.00',
      },
      {
        status: CustodyStatus.REJECTED,
        amount: '1500.00',
        settledExpensesAmount: '0.00',
        cashReturnedAmount: '0.00',
        remainingBalance: '1500.00',
      },
      {
        status: CustodyStatus.SETTLED,
        amount: '4000.00',
        settledExpensesAmount: '4000.00',
        cashReturnedAmount: '0.00',
        remainingBalance: '0.00',
      },
    ];

    const totals = calculateUserCustodiesTotals(custodies);

    // Total Issued = ISSUED (10k) + PARTIALLY_SETTLED (5k) + SETTLED (4k) = 19,000.00 (excludes DRAFT, SUBMITTED, REJECTED)
    expect(totals.totalIssued).toBe('19000.00');

    // Total Settled = 3500.25 + 3000.00 + 4000.00 = 10500.25
    expect(totals.totalSettled).toBe('10500.25');

    // Total Returned = 1000.50
    expect(totals.totalReturned).toBe('1000.50');

    // Total Outstanding = ISSUED (6499.75) + PARTIALLY_SETTLED (999.50) = 7499.25
    expect(totals.totalOutstanding).toBe('7499.25');
  });

  it('proves getProjectCustodies project totals include approved and pending payroll consistently (D2 bug fix)', async () => {
    // 1. Mock project
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      id: mockProjectId,
      name: 'مشروع الأبراج السكنية',
      code: 'PRJ-D1-01',
      status: 'ACTIVE',
    } as never);

    // 2. Mock budget with 100,000 SAR ceiling
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      id: 'budget-d1',
      projectId: mockProjectId,
      status: BudgetStatus.APPROVED,
      lines: [
        {
          id: mockBudgetLineId,
          budgetId: 'budget-d1',
          category: BudgetCategory.LABOR,
          description: 'أجور عمالة الموقع والحدادة',
          amount: new Prisma.Decimal('100000.00'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as never);

    // 3. Mock custodies: 10,000 issued (all unspent outstanding)
    vi.spyOn(prisma.custody, 'findMany').mockResolvedValue([
      {
        id: 'custody-1',
        projectId: mockProjectId,
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('10000.00'),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        status: CustodyStatus.ISSUED,
        purpose: 'مصاريف موقع طارئة',
        code: 'CUST-01',
        custodianUserId: testManager.id,
        custodian: testManager,
        createdById: testManager.id,
        createdBy: testManager,
        submittedById: testManager.id,
        submittedBy: testManager,
        approvedById: testManager.id,
        approvedBy: testManager,
        rejectedById: null,
        rejectedBy: null,
        cancelledById: null,
        cancelledBy: null,
        issuedById: testManager.id,
        issuedBy: testManager,
        closedById: null,
        closedBy: null,
        expectedSettlementDate: null,
        settledAt: null,
        closedAt: null,
        rejectedAt: null,
        cancelledAt: null,
        rejectionReason: null,
        cancellationReason: null,
        submittedAt: new Date(),
        approvedAt: new Date(),
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        expenses: [],
      },
    ] as never);

    // 4. Mock commitments: 20,000 approved, 5,000 submitted
    vi.spyOn(prisma.commitment, 'findMany').mockResolvedValue([
      {
        id: 'comm-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('20000.00'),
        status: CommitmentStatus.APPROVED,
      },
      {
        id: 'comm-2',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('5000.00'),
        status: CommitmentStatus.SUBMITTED,
      },
    ] as never);

    // 5. Mock expenses: 5,000 approved direct
    vi.spyOn(prisma.expense, 'findMany').mockResolvedValue([
      {
        id: 'exp-1',
        budgetLineId: mockBudgetLineId,
        custodyId: null,
        amount: new Prisma.Decimal('5000.00'),
        status: ExpenseStatus.APPROVED,
      },
    ] as never);

    // 6. Mock payroll: 15,000 approved, 3,000 submitted
    vi.spyOn(prisma.payrollEntry, 'findMany').mockResolvedValue([
      {
        id: 'pay-1',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('15000.00'),
        status: PayrollStatus.APPROVED,
      },
      {
        id: 'pay-2',
        budgetLineId: mockBudgetLineId,
        amount: new Prisma.Decimal('3000.00'),
        status: PayrollStatus.SUBMITTED,
      },
    ] as never);

    const result = await getProjectCustodies(mockProjectId);

    // Invariant checks on project-level totals (D2 Bug Fix):
    // Total Active Exposure MUST include approved payroll (15k):
    // Total Active Exposure = ApprovedCommitments (20k) + ApprovedExpenses (5k) + OutstandingCustody (10k) + ApprovedPayroll (15k)
    //                       = 50,000.00 SAR
    // Total Available Balance = 100,000 - 50,000 = 50,000.00 SAR (matches line breakdown!)
    expect(result.totalAuthorizedBudget).toBe('100000.00');
    expect(result.totalApprovedCommitments).toBe('20000.00');
    expect(result.totalApprovedExpenses).toBe('5000.00');
    expect(result.totalOutstandingCustodies).toBe('10000.00');
    expect(result.totalActiveExposure).toBe('50000.00');
    expect(result.totalAvailableBalance).toBe('50000.00');

    // Total Pending Exposure MUST include pending payroll (3k):
    // Total Pending Exposure = PendingCommitments (5k) + PendingPayroll (3k) = 8,000.00 SAR
    expect(result.totalPendingExposure).toBe('8000.00');
    expect(result.totalProjectedBalance).toBe('42000.00'); // 50k - 8k = 42k

    // Ensure line breakdown and project totals match 100%
    const line = result.lines[0]!;
    expect(line.totalActiveExposure).toBe(result.totalActiveExposure);
    expect(line.availableBalance).toBe(result.totalAvailableBalance);
    expect(line.totalPendingExposure).toBe(result.totalPendingExposure);
    expect(line.projectedBalance).toBe(result.totalProjectedBalance);
  });
});
