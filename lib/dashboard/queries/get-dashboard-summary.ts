/**
 * lib/dashboard/queries/get-dashboard-summary.ts
 *
 * Canonical executive dashboard use-case (Vertical Slice 9).
 *
 * Single authoritative read boundary for the executive dashboard.
 * Returns ExecutiveDashboardDTO — all primitive strings, no Prisma types.
 *
 * Authorization (BD-02):
 *   - requireAuth() verifies authentication and active status
 *   - canViewExecutiveDashboard() restricts to active Manager only
 *
 * Aggregation strategy (BD-26):
 *   - 15 total DB queries in two batches — no N+1
 *   - One project + budget lines query
 *   - 14 parallel aggregate/count queries (9 groupBy + 5 count)
 *   - All groupBy results indexed by budgetLineId in O(1) Maps
 *   - calculateBudgetLineExposure() called once per budget line
 *   - getPayrollExposureBatch() supplies payroll totals — no N+1
 *
 * Financial invariants (BD-31, BD-37):
 *   ActualSpend = DirectActualSpend + CustodyActualSpend + ApprovedPayroll
 *   TotalActiveExposure = ApprovedCommitments + DirectActualSpend
 *                         + CustodyActualSpend + OutstandingCustodies
 *                         + ApprovedPayroll
 *   SubcontractorBilling amounts NEVER enter exposure
 *   ApprovedPayroll counted exactly once
 *   Outstanding custody = Custody.amount − settledExpenses − cashReturned
 *
 * Data freshness (BD-27):
 *   No revalidate, no unstable_cache, no ISR.
 *   requireAuth() reads cookies → Next.js marks this route as dynamic.
 *
 * Privacy (BD-33):
 *   No workerName, workerReference, tradeOrTitle, credentials, or audit metadata.
 *   Only aggregate amounts, counts, project identifiers, and project status.
 *
 * See AGENTS.md §7 (Separation of Concerns), §13 (Financial Security).
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  SubcontractorBillingStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { policies } from '@/lib/permissions/policies';
import { calculateBudgetLineExposure } from '@/lib/custodies/calculations';
import { getPayrollExposureBatch } from '@/lib/payroll/queries/get-payroll-exposure-batch';
import {
  createCompanyAccumulator,
  createEmptyProjectAccumulator,
  toExecutiveDashboardDTO,
  type ProjectFinancialAccumulator,
} from '../mappers';
import type { ExecutiveDashboardDTO, PendingApprovalsDTO } from '../types';

// ---------------------------------------------------------------------------
// Main use-case entry point
// ---------------------------------------------------------------------------

/**
 * Fetches all data required for the executive dashboard and returns a
 * fully-serialized ExecutiveDashboardDTO.
 *
 * No inputs beyond the authenticated session.
 * No business filters. No projectId parameter.
 * No mutations. No Server Action wrapper.
 *
 * @throws AppError('UNAUTHENTICATED') if no valid session
 * @throws AppError('FORBIDDEN') if authenticated user is not an active Manager
 */
export async function getDashboardSummary(): Promise<ExecutiveDashboardDTO> {
  const generatedAt = new Date();

  // -------------------------------------------------------------------------
  // 1. Authorization — must come before any DB access
  // -------------------------------------------------------------------------
  const actor = await requireAuth();

  if (!policies.canViewExecutiveDashboard(actor)) {
    throw new AppError(
      'FORBIDDEN',
      'لوحة المتابعة التنفيذية مخصصة للمدير فقط.',
    );
  }

  // -------------------------------------------------------------------------
  // 2. Fetch all non-deleted projects with their single APPROVED budget + lines
  //    (BD-04: all projects, all statuses, deletedAt = null)
  // -------------------------------------------------------------------------
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      budgets: {
        where: { status: BudgetStatus.APPROVED, deletedAt: null },
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          id: true,
          lines: {
            select: { id: true, amount: true },
          },
        },
      },
    },
  });

  // Collect all budget line IDs across all projects for batch queries
  const allBudgetLineIds: string[] = [];
  for (const project of projects) {
    const approvedBudget = project.budgets[0];
    if (approvedBudget) {
      for (const line of approvedBudget.lines) {
        allBudgetLineIds.push(line.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Batch-aggregate all financial data in parallel (14 queries + project query = 15 total)
  //    BD-26: no N+1
  // -------------------------------------------------------------------------
  const zero = new Prisma.Decimal('0.00');

  const [
    approvedCommitmentsAgg,
    pendingCommitmentsAgg,
    directApprovedExpensesAgg,
    custodyApprovedExpensesAgg,
    pendingDirectExpensesAgg,
    pendingCustodiesAgg,
    activeCustodies,
    payrollBatch,
    expensePendingCount,
    commitmentPendingCount,
    custodyPendingCount,
    payrollPendingCount,
    billingPendingCount,
  ] = await Promise.all([
    // 3.1 Approved commitments grouped by budgetLineId
    allBudgetLineIds.length > 0
      ? prisma.commitment.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: CommitmentStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.2 Pending (SUBMITTED) commitments grouped by budgetLineId
    allBudgetLineIds.length > 0
      ? prisma.commitment.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: CommitmentStatus.SUBMITTED,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.3 Approved direct expenses (custodyId = null) grouped by budgetLineId
    allBudgetLineIds.length > 0
      ? prisma.expense.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: ExpenseStatus.APPROVED,
            custodyId: null,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.4 Approved custody-linked expenses (custodyId IS NOT NULL) grouped by budgetLineId
    allBudgetLineIds.length > 0
      ? prisma.expense.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: ExpenseStatus.APPROVED,
            custodyId: { not: null },
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.5 Pending direct expenses (SUBMITTED, custodyId = null) grouped by budgetLineId
    allBudgetLineIds.length > 0
      ? prisma.expense.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: ExpenseStatus.SUBMITTED,
            custodyId: null,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.6 Pending custodies (SUBMITTED) for PendingExposure
    allBudgetLineIds.length > 0
      ? prisma.custody.groupBy({
          by: ['budgetLineId'],
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: CustodyStatus.SUBMITTED,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve([]),

    // 3.7 Active custodies for outstanding custody calculation
    //     Only ISSUED and PARTIALLY_SETTLED — bounded operational set
    //     Loads only the fields required: no PII, no audit metadata
    allBudgetLineIds.length > 0
      ? prisma.custody.findMany({
          where: {
            budgetLineId: { in: allBudgetLineIds },
            status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
            deletedAt: null,
          },
          select: {
            budgetLineId: true,
            amount: true,
            cashReturnedAmount: true,
            expenses: {
              where: { status: ExpenseStatus.APPROVED, deletedAt: null },
              select: { amount: true },
            },
          },
        })
      : Promise.resolve([]),

    // 3.8 Payroll batch via shared core — 2 internal groupBy queries
    //     BD-plan: getBudgetLinePayrollExposure() semantics, no N+1
    getPayrollExposureBatch(allBudgetLineIds),

    // 3.9–3.13 Company-wide pending approval counts (BD-16: counts only)
    prisma.expense.count({
      where: { status: ExpenseStatus.SUBMITTED, deletedAt: null },
    }),
    prisma.commitment.count({
      where: { status: CommitmentStatus.SUBMITTED, deletedAt: null },
    }),
    prisma.custody.count({
      where: { status: CustodyStatus.SUBMITTED, deletedAt: null },
    }),
    prisma.payrollEntry.count({
      where: { status: PayrollStatus.SUBMITTED, deletedAt: null },
    }),
    prisma.subcontractorBilling.count({
      where: { status: SubcontractorBillingStatus.SUBMITTED, deletedAt: null },
    }),
  ]);

  // -------------------------------------------------------------------------
  // 4. Build O(1) lookup Maps from grouped results
  // -------------------------------------------------------------------------
  function buildDecimalMap(
    agg: Array<{ budgetLineId: string; _sum: { amount: Prisma.Decimal | null } }>,
  ): Map<string, Prisma.Decimal> {
    return new Map(agg.map((r) => [r.budgetLineId, r._sum.amount ?? zero]));
  }

  const approvedCommitmentsMap = buildDecimalMap(approvedCommitmentsAgg);
  const pendingCommitmentsMap = buildDecimalMap(pendingCommitmentsAgg);
  const directApprovedMap = buildDecimalMap(directApprovedExpensesAgg);
  const custodyApprovedMap = buildDecimalMap(custodyApprovedExpensesAgg);
  const pendingDirectExpensesMap = buildDecimalMap(pendingDirectExpensesAgg);
  const pendingCustodiesMap = buildDecimalMap(pendingCustodiesAgg);

  // Outstanding custody map: aggregated per budgetLineId from the bounded row set
  // OutstandingBalance = Custody.amount − SUM(approved linked expenses) − cashReturnedAmount
  const outstandingCustodyMap = new Map<string, Prisma.Decimal>();
  for (const custody of activeCustodies) {
    const settledExpenses = custody.expenses.reduce(
      (sum, e) => sum.add(e.amount),
      zero,
    );
    const outstandingBalance = custody.amount
      .sub(settledExpenses)
      .sub(custody.cashReturnedAmount ?? zero);

    const existing = outstandingCustodyMap.get(custody.budgetLineId) ?? zero;
    outstandingCustodyMap.set(
      custody.budgetLineId,
      existing.add(outstandingBalance),
    );
  }

  // -------------------------------------------------------------------------
  // 5. Accumulate per-project and company totals
  // -------------------------------------------------------------------------
  const companyAcc = createCompanyAccumulator();
  const projectAccumulators: ProjectFinancialAccumulator[] = [];

  for (const project of projects) {
    const approvedBudget = project.budgets[0];

    if (!approvedBudget || approvedBudget.lines.length === 0) {
      // Project has no approved budget — show empty state (BD-22)
      projectAccumulators.push(
        createEmptyProjectAccumulator(
          project.id,
          project.code,
          project.name,
          project.status,
        ),
      );
      continue;
    }

    const projectAcc: ProjectFinancialAccumulator = {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      projectStatus: project.status,
      hasApprovedBudget: true,
      authorizedBudget: zero,
      actualSpend: zero,
      activeExposure: zero,
      availableBalance: zero,
      pendingExposure: zero,
      projectedBalance: zero,
    };

    for (const line of approvedBudget.lines) {
      const lineAmount = line.amount as Prisma.Decimal;
      const approvedCommitments = approvedCommitmentsMap.get(line.id) ?? zero;
      const directActualSpend = directApprovedMap.get(line.id) ?? zero;
      const custodyActualSpend = custodyApprovedMap.get(line.id) ?? zero;
      const outstandingCustodies = outstandingCustodyMap.get(line.id) ?? zero;
      const pendingCommitments = pendingCommitmentsMap.get(line.id) ?? zero;
      const pendingDirectExpenses = pendingDirectExpensesMap.get(line.id) ?? zero;
      const pendingCustodies = pendingCustodiesMap.get(line.id) ?? zero;
      const { approvedPayroll, pendingPayroll } =
        payrollBatch.get(line.id) ?? {
          approvedPayroll: zero,
          pendingPayroll: zero,
        };

      // Canonical exposure formula — single source of truth (BD-26)
      const exposure = calculateBudgetLineExposure({
        authorizedAmount: lineAmount,
        approvedCommitments,
        directActualSpend,
        custodyActualSpend,
        outstandingCustodies,
        approvedPayroll,
        pendingCommitments,
        pendingDirectExpenses,
        pendingCustodies,
        pendingPayroll,
      });

      // BD-31: ActualSpend is derived separately from the same inputs
      // ActualSpend = DirectActualSpend + CustodyActualSpend + ApprovedPayroll
      // This is intentionally distinct from TotalActiveExposure
      const lineActualSpend = directActualSpend
        .add(custodyActualSpend)
        .add(approvedPayroll);

      // Accumulate into project totals
      projectAcc.authorizedBudget = projectAcc.authorizedBudget.add(lineAmount);
      projectAcc.actualSpend = projectAcc.actualSpend.add(lineActualSpend);
      projectAcc.activeExposure = projectAcc.activeExposure.add(
        exposure.totalActiveExposure,
      );
      projectAcc.availableBalance = projectAcc.availableBalance.add(
        exposure.availableBalance,
      );
      projectAcc.pendingExposure = projectAcc.pendingExposure.add(
        exposure.totalPendingExposure,
      );
      projectAcc.projectedBalance = projectAcc.projectedBalance.add(
        exposure.projectedBalance,
      );
    }

    projectAccumulators.push(projectAcc);

    // Accumulate into company totals
    companyAcc.totalAuthorizedBudget = companyAcc.totalAuthorizedBudget.add(
      projectAcc.authorizedBudget,
    );
    companyAcc.totalActualSpend = companyAcc.totalActualSpend.add(
      projectAcc.actualSpend,
    );
    companyAcc.totalActiveExposure = companyAcc.totalActiveExposure.add(
      projectAcc.activeExposure,
    );
    companyAcc.totalAvailableBalance = companyAcc.totalAvailableBalance.add(
      projectAcc.availableBalance,
    );
    companyAcc.totalPendingExposure = companyAcc.totalPendingExposure.add(
      projectAcc.pendingExposure,
    );
    companyAcc.totalProjectedBalance = companyAcc.totalProjectedBalance.add(
      projectAcc.projectedBalance,
    );
  }

  // -------------------------------------------------------------------------
  // 6. Assemble pending approvals DTO (BD-16: counts only, no SAR amounts)
  // -------------------------------------------------------------------------
  const pendingApprovals: PendingApprovalsDTO = {
    expenses: expensePendingCount,
    commitments: commitmentPendingCount,
    custodies: custodyPendingCount,
    payrollEntries: payrollPendingCount,
    subcontractorBillings: billingPendingCount,
    total:
      expensePendingCount +
      commitmentPendingCount +
      custodyPendingCount +
      payrollPendingCount +
      billingPendingCount,
  };

  // -------------------------------------------------------------------------
  // 7. Map to DTO — Decimal → string, Date → ISO string (BD-32)
  // -------------------------------------------------------------------------
  return toExecutiveDashboardDTO(
    companyAcc,
    pendingApprovals,
    projectAccumulators,
    generatedAt,
  );
}
