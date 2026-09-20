/**
 * lib/custodies/types.ts
 *
 * Domain and DTO types for the Custody / Advance Payments & Settlement module.
 * Pure types — no database or server-only runtime dependencies.
 *
 * Follows AGENTS.md §13 (monetary representation as string) and §26 (client-safe boundary).
 */

import type { BudgetCategory, CustodyStatus, ExpenseStatus } from '@prisma/client';

export type { CustodyStatus };

/**
 * Basic user summary included in custody metadata.
 */
export type CustodyUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Basic budget line info attached to a custody.
 */
export type CustodyBudgetLineInfo = {
  id: string;
  category: BudgetCategory;
  description: string;
  amount: string; // authorized line ceiling
};

/**
 * Basic project info attached to a custody.
 */
export type CustodyProjectInfo = {
  id: string;
  name: string;
  code: string;
};

/**
 * Summary of an expense linked to a custody.
 */
export type CustodyLinkedExpenseInfo = {
  id: string;
  amount: string;
  description: string;
  expenseDate: Date;
  status: ExpenseStatus;
  submittedBy: CustodyUserInfo;
  approvedAt: Date | null;
};

/**
 * Client-safe DTO for a Custody record.
 * All monetary amounts are strings to prevent IEEE 754 float precision loss.
 */
export type CustodySummaryDTO = {
  id: string;
  code: string;
  projectId: string;
  project?: CustodyProjectInfo | undefined;
  budgetLineId: string;
  budgetLine?: CustodyBudgetLineInfo | undefined;
  custodianUserId: string;
  custodian: CustodyUserInfo;

  amount: string; // Authorized advance envelope amount
  currency: string;
  purpose: string;
  status: CustodyStatus;

  // Real-time derived financial figures
  settledExpensesAmount: string; // Sum of approved expenses
  cashReturnedAmount: string;    // Recorded unspent cash returned
  remainingBalance: string;      // amount - settled - returned
  availableToClaim: string;      // remainingBalance - pending submitted expenses

  createdById: string;
  createdBy: CustodyUserInfo;

  submittedById: string | null;
  submittedBy: CustodyUserInfo | null;
  submittedAt: Date | null;

  approvedById: string | null;
  approvedBy: CustodyUserInfo | null;
  approvedAt: Date | null;

  rejectedById: string | null;
  rejectedBy: CustodyUserInfo | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  cancelledById: string | null;
  cancelledBy: CustodyUserInfo | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;

  issuedById: string | null;
  issuedBy: CustodyUserInfo | null;
  issuedAt: Date | null;

  settledAt: Date | null;

  closedById: string | null;
  closedBy: CustodyUserInfo | null;
  closedAt: Date | null;

  expectedSettlementDate: Date | null;
  expensesCount: number;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Detailed custody DTO with full list of linked expenses.
 */
export type CustodyDetailDTO = CustodySummaryDTO & {
  expenses: CustodyLinkedExpenseInfo[];
};

/**
 * BudgetLine breakdown item for Custody exposure overview.
 */
export type BudgetLineCustodySpendDTO = {
  budgetLineId: string;
  category: BudgetCategory;
  description: string;
  authorizedAmount: string;
  approvedExpenses: string;
  approvedCommitments: string;
  outstandingCustodies: string;
  totalActiveExposure: string;
  availableBalance: string;
  pendingCustodies: string;
  totalPendingExposure: string;
  projectedBalance: string;
};

/**
 * Overview DTO for Project Custodies page.
 */
export type ProjectCustodiesOverviewDTO = {
  projectId: string;
  projectName: string;
  projectCode: string;
  totalAuthorizedBudget: string;
  totalApprovedExpenses: string;
  totalApprovedCommitments: string;
  totalOutstandingCustodies: string;
  totalActiveExposure: string;
  totalAvailableBalance: string;
  totalPendingExposure: string;
  totalProjectedBalance: string;
  lines: BudgetLineCustodySpendDTO[];
  custodies: CustodySummaryDTO[];
};
