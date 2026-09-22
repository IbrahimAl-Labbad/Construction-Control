/**
 * lib/subcontractor-billings/types.ts
 *
 * Domain and DTO types for the Subcontractor Billing module.
 * CLIENT-SAFE — no database or server-only runtime dependencies.
 *
 * All monetary amounts are represented as strings (e.g. "1250.00")
 * to prevent IEEE 754 float precision loss at the client boundary.
 *
 * Follows AGENTS.md §13 (monetary representation as string) and
 * §26 (server/client module boundary).
 *
 * Financial invariant (Design Gate — confirmed decisions #4 and #21):
 *   approvedBillingsCertified is a DISPLAY-ONLY field.
 *   It must NEVER enter calculateBudgetLineExposure().
 *   BudgetLine totalActiveExposure = ApprovedCommitments
 *                                    + ApprovedExpenses
 *                                    + OutstandingCustodies
 *   (Unchanged from Slice 6.)
 */

import type { BudgetCategory, SubcontractorBillingStatus } from '@prisma/client';

export type { SubcontractorBillingStatus };

// ---------------------------------------------------------------------------
// Supporting info types
// ---------------------------------------------------------------------------

/**
 * Basic user summary included in billing metadata.
 */
export type BillingUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Basic budget line info attached to a billing record.
 */
export type BillingBudgetLineInfo = {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Authorized BudgetLine ceiling as a string (Decimal). */
  amount: string;
};

/**
 * Basic Commitment info attached to a billing record.
 * The Commitment is the contractual source; billing draws against it.
 */
export type BillingCommitmentInfo = {
  id: string;
  vendorName: string;
  /** Commitment.amount — the ceiling for all billings on this commitment. */
  amount: string;
  referenceNumber: string | null;
};

/**
 * Basic project info attached to a billing record.
 */
export type BillingProjectInfo = {
  id: string;
  name: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Primary DTO
// ---------------------------------------------------------------------------

/**
 * Client-safe DTO for a single SubcontractorBilling record.
 * All monetary amounts are strings to prevent IEEE 754 float precision loss.
 */
export type SubcontractorBillingSummaryDTO = {
  id: string;

  projectId: string;
  project?: BillingProjectInfo | undefined;

  budgetLineId: string;
  budgetLine?: BillingBudgetLineInfo | undefined;

  /** commitmentId is REQUIRED — billing cannot exist without an APPROVED Commitment. */
  commitmentId: string;
  commitment?: BillingCommitmentInfo | undefined;

  subcontractorName: string;
  referenceNumber: string | null;
  billingPeriod: string;
  claimDate: Date;

  /** Gross claim amount before deductions. Positive SAR. String representation of Decimal. */
  grossAmount: string;
  currency: string;

  description: string;
  status: SubcontractorBillingStatus;

  createdById: string;
  createdBy: BillingUserInfo;

  submittedById: string | null;
  submittedBy: BillingUserInfo | null;
  submittedAt: Date | null;

  approvedById: string | null;
  approvedBy: BillingUserInfo | null;
  approvedAt: Date | null;

  rejectedById: string | null;
  rejectedBy: BillingUserInfo | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Per-Commitment billing summary (display only — NOT part of BudgetLine exposure)
// ---------------------------------------------------------------------------

/**
 * Financial summary of all billings against a single Commitment.
 *
 * CRITICAL: cumulativeCertified and remainingCommitmentBalance are
 * DISPLAY-ONLY values computed server-side. They must never be added
 * to BudgetLine totalActiveExposure (design gate decision #4 and #21).
 */
export type CommitmentBillingSummaryDTO = {
  commitmentId: string;
  commitmentVendorName: string;
  commitmentReferenceNumber: string | null;
  /** Commitment.amount — the contractual ceiling. */
  contractValue: string;
  /** SUM(APPROVED billings.grossAmount) for this Commitment. Display only. */
  cumulativeCertified: string;
  /** contractValue − cumulativeCertified. Display only. */
  remainingCommitmentBalance: string;
  /** Count of APPROVED billings for this Commitment. */
  approvedBillingCount: number;
  billings: SubcontractorBillingSummaryDTO[];
};

// ---------------------------------------------------------------------------
// Per-project overview DTO
// ---------------------------------------------------------------------------

/**
 * Comprehensive project billing overview for management and control.
 *
 * CRITICAL: approvedBillingsCertified is a display-only aggregation.
 * It must never enter calculateBudgetLineExposure().
 */
export type ProjectBillingsOverviewDTO = {
  projectId: string;
  projectName: string;
  projectCode: string;

  /**
   * Sum of all APPROVED billing grossAmounts across all commitments
   * for this project. DISPLAY ONLY — not part of BudgetLine exposure.
   */
  totalApprovedBillingsCertified: string;

  /** Count of billings in SUBMITTED status awaiting Manager action. */
  pendingBillingsCount: number;

  /** Per-commitment billing summaries. */
  commitmentBillings: CommitmentBillingSummaryDTO[];

  /** Flat list of all billing records for this project. */
  billings: SubcontractorBillingSummaryDTO[];
};
