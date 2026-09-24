/**
 * lib/dashboard/types.ts
 *
 * Client-safe DTO types for the Executive Dashboard (Vertical Slice 9).
 *
 * Design constraints (Business Decision Lock — BD-32, BD-33):
 * - All monetary values are strings: Decimal → .toFixed(2) at server boundary
 * - Currency is the literal 'SAR' — never a plain string
 * - generatedAt is an ISO-8601 string — never a Date object
 * - No Prisma types, no Decimal, no Date in any DTO
 * - No PII: no workerName, workerReference, tradeOrTitle, credentials, audit metadata
 * - Contains only: aggregate amounts, counts, project identifiers, project status
 *
 * Financial metric distinction (BD-31):
 *   ActualSpend = DirectActualSpend + CustodyActualSpend + ApprovedPayroll
 *   TotalActiveExposure = ApprovedCommitments + DirectActualSpend
 *                         + CustodyActualSpend + OutstandingCustodies
 *                         + ApprovedPayroll
 *
 * These are distinct values with distinct labels. 'actualSpend' ≠ 'activeExposure'.
 *
 * Audience: Manager only (BD-02).
 *
 * See AGENTS.md §13 for financial representation rules.
 */

import type { ProjectStatus } from '@prisma/client';

// Re-export for convenience of consumers
export type { ProjectStatus };

// ---------------------------------------------------------------------------
// Company-level financial summary DTO
// ---------------------------------------------------------------------------

/**
 * Company-wide financial aggregates across all non-deleted projects.
 * All monetary amounts are exact-decimal strings (Decimal → .toFixed(2)).
 * BD-31: actualSpend and activeExposure are intentionally separate fields.
 */
export type CompanyFinancialSummaryDTO = {
  /** SUM(BudgetLine.amount) across all APPROVED budgets of all non-deleted projects */
  totalAuthorizedBudget: string;

  /**
   * DirectActualSpend + CustodyActualSpend + ApprovedPayroll.
   * Does NOT include ApprovedCommitments or OutstandingCustodies.
   * BD-31: this is NOT TotalActiveExposure.
   */
  totalActualSpend: string;

  /**
   * ApprovedCommitments + DirectActualSpend + CustodyActualSpend
   * + OutstandingCustodies + ApprovedPayroll.
   * BD-31: this is NOT ActualSpend — it includes commitments and outstanding custodies.
   */
  totalActiveExposure: string;

  /** AuthorizedBudget − TotalActiveExposure */
  totalAvailableBalance: string;

  /**
   * PendingCommitments + PendingDirectExpenses + PendingCustodies + PendingPayroll.
   * SubcontractorBilling amounts are never included (BD-37 / Slice 7 gate).
   */
  totalPendingExposure: string;

  /** AvailableBalance − PendingExposure */
  totalProjectedBalance: string;

  currency: 'SAR';
};

// ---------------------------------------------------------------------------
// Pending approvals DTO
// ---------------------------------------------------------------------------

/**
 * Company-wide counts of records awaiting Manager approval.
 * BD-16: counts only — no SAR amounts for pending items.
 * BD-33: no entity details, no actor information.
 */
export type PendingApprovalsDTO = {
  /** Expense records with status = SUBMITTED */
  expenses: number;
  /** Commitment records with status = SUBMITTED */
  commitments: number;
  /** Custody records with status = SUBMITTED */
  custodies: number;
  /** PayrollEntry records with status = SUBMITTED */
  payrollEntries: number;
  /** SubcontractorBilling records with status = SUBMITTED */
  subcontractorBillings: number;
  /** Sum of all five counts above */
  total: number;
};

// ---------------------------------------------------------------------------
// Per-project financial summary DTO
// ---------------------------------------------------------------------------

/**
 * Financial summary for a single project within the executive dashboard.
 * All monetary amounts are exact-decimal strings (Decimal → .toFixed(2)).
 * BD-22: All non-deleted projects appear, all statuses represented.
 * BD-33: No workerName, workerReference, tradeOrTitle, or individual amounts.
 */
export type ProjectFinancialSummaryDTO = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;

  /**
   * True when the project has exactly one APPROVED budget.
   * When false, all financial string fields are '0.00' — nothing fabricated.
   */
  hasApprovedBudget: boolean;

  /** SUM(BudgetLine.amount) across the approved budget's lines, or '0.00' if none */
  authorizedBudget: string;

  /**
   * DirectActualSpend + CustodyActualSpend + ApprovedPayroll.
   * BD-31: distinct from activeExposure.
   */
  actualSpend: string;

  /**
   * ApprovedCommitments + DirectActualSpend + CustodyActualSpend
   * + OutstandingCustodies + ApprovedPayroll.
   * BD-31: distinct from actualSpend.
   */
  activeExposure: string;

  /** authorizedBudget − activeExposure */
  availableBalance: string;

  /** PendingCommitments + PendingDirectExpenses + PendingCustodies + PendingPayroll */
  pendingExposure: string;

  /** availableBalance − pendingExposure */
  projectedBalance: string;

  currency: 'SAR';
};

// ---------------------------------------------------------------------------
// Root executive dashboard DTO
// ---------------------------------------------------------------------------

/**
 * Root DTO returned by getDashboardSummary() and consumed by the dashboard page.
 * All fields are client-safe primitives (no Date, no Decimal, no Prisma types).
 * BD-32: generatedAt is an ISO-8601 string.
 */
export type ExecutiveDashboardDTO = {
  companySummary: CompanyFinancialSummaryDTO;
  pendingApprovals: PendingApprovalsDTO;

  /**
   * One entry per non-deleted project, all statuses included (BD-22).
   * Ordered by project code ascending for stable rendering.
   */
  projects: ProjectFinancialSummaryDTO[];

  /**
   * ISO-8601 timestamp of when the dashboard data was generated.
   * Created at the start of getDashboardSummary() execution.
   * BD-32: string — never a Date object.
   */
  generatedAt: string;
};
