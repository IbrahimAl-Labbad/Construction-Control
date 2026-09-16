/**
 * lib/commitments/types.ts
 *
 * Domain and DTO types for the Purchasing & Commitments module.
 * Pure types — no database or server-only runtime dependencies.
 *
 * Follows AGENTS.md §13 (monetary representation as string) and §26 (client-safe boundary).
 * Strictly implements Mandatory Correction 1 (explicit exposure distinctions).
 */

import type { BudgetCategory, CommitmentStatus } from '@prisma/client';

export type { CommitmentStatus };

/**
 * Basic user summary included in commitment metadata (creator, submitter, approver, rejecter).
 */
export type CommitmentUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Basic budget line info attached to a commitment.
 */
export type CommitmentBudgetLineInfo = {
  id: string;
  category: BudgetCategory;
  description: string;
  amount: string; // authorized line ceiling
};

/**
 * Basic project info attached to a commitment.
 */
export type CommitmentProjectInfo = {
  id: string;
  name: string;
  code: string;
};

/**
 * Client-safe DTO for a Commitment record.
 * All monetary amounts are strings to prevent IEEE 754 float precision loss.
 */
export type CommitmentSummaryDTO = {
  id: string;
  projectId: string;
  project?: CommitmentProjectInfo | undefined;
  budgetLineId: string;
  budgetLine?: CommitmentBudgetLineInfo | undefined;
  referenceNumber: string | null;
  vendorName: string;
  amount: string; // e.g. "1250.00"
  currency: string;
  description: string;
  commitmentDate: Date;
  status: CommitmentStatus;

  createdById: string;
  createdBy: CommitmentUserInfo;

  submittedById: string | null;
  submittedBy: CommitmentUserInfo | null;
  submittedAt: Date | null;

  approvedById: string | null;
  approvedBy: CommitmentUserInfo | null;
  approvedAt: Date | null;

  rejectedById: string | null;
  rejectedBy: CommitmentUserInfo | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Financial breakdown for a single budget line under Slice 5.
 * Strictly fulfills Mandatory Correction 1.
 */
export type BudgetLineCommitmentSpendDTO = {
  budgetLineId: string;
  category: BudgetCategory;
  description: string;
  authorizedAmount: string; // BudgetLine.amount

  // Realized & Committed Exposures
  approvedExpenses: string;          // SUM(APPROVED expenses)
  approvedCommitments: string;       // SUM(APPROVED commitments)
  totalExposure: string;             // approvedExpenses + approvedCommitments
  availableBalance: string;          // authorizedAmount - totalExposure

  // Pending Exposures
  pendingCommitmentExposure: string; // SUM(SUBMITTED commitments)
  pendingExpenseExposure: string;    // SUM(SUBMITTED expenses)
  totalPendingExposure: string;      // pendingCommitmentExposure + pendingExpenseExposure

  // Projected Balance
  projectedBalance: string;          // availableBalance - totalPendingExposure
};

/**
 * Comprehensive project commitments overview for management and control.
 * Strictly fulfills Mandatory Correction 1.
 */
export type ProjectCommitmentsOverviewDTO = {
  projectId: string;
  projectName: string;
  projectCode: string;

  totalAuthorizedBudget: string;
  totalApprovedExpenses: string;
  totalApprovedCommitments: string;
  totalExposure: string;
  totalAvailableBalance: string;

  totalPendingCommitmentExposure: string;
  totalPendingExpenseExposure: string;
  totalPendingExposure: string;
  totalProjectedBalance: string;

  lines: BudgetLineCommitmentSpendDTO[];
  commitments: CommitmentSummaryDTO[];
};
