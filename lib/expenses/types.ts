/**
 * lib/expenses/types.ts
 *
 * Domain and DTO types for the Project Expense module.
 * Pure types — no database or server-only runtime dependencies.
 *
 * Follows AGENTS.md §13 (monetary representation as string) and §26 (client-safe boundary).
 */

import type { BudgetCategory, ExpenseStatus } from '@prisma/client';

export type { ExpenseStatus };

/**
 * Basic user summary included in expense metadata (submitter, approver, rejecter).
 */
export type ExpenseUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Basic budget line info attached to an expense.
 */
export type ExpenseBudgetLineInfo = {
  id: string;
  category: BudgetCategory;
  description: string;
  amount: string; // authorized line ceiling
};

/**
 * Basic project info attached to an expense.
 */
export type ExpenseProjectInfo = {
  id: string;
  name: string;
  code: string;
};

/**
 * Client-safe DTO for an Expense record.
 * All monetary amounts are strings to prevent IEEE 754 float precision loss.
 */
export type ExpenseSummaryDTO = {
  id: string;
  projectId: string;
  project?: ExpenseProjectInfo | undefined;
  budgetLineId: string;
  budgetLine?: ExpenseBudgetLineInfo | undefined;
  custodyId?: string | null;
  amount: string; // e.g. "1250.00"
  currency: string;
  description: string;
  expenseDate: Date;
  status: ExpenseStatus;

  submittedById: string;
  submittedBy: ExpenseUserInfo;
  submittedAt: Date | null;

  approvedById: string | null;
  approvedBy: ExpenseUserInfo | null;
  approvedAt: Date | null;

  rejectedById: string | null;
  rejectedBy: ExpenseUserInfo | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Spend breakdown for a single budget line.
 */
export type BudgetLineSpendDTO = {
  budgetLineId: string;
  category: BudgetCategory;
  description: string;
  authorizedAmount: string; // e.g. "100000.00"
  actualSpend: string;      // SUM(APPROVED)
  pendingExposure: string;  // SUM(SUBMITTED)
  availableBalance: string; // Authorized - ActualSpend
  projectedBalance: string; // Available - PendingExposure
};

/**
 * Comprehensive project expenses overview for management and control.
 */
export type ProjectExpensesOverviewDTO = {
  projectId: string;
  projectName: string;
  projectCode: string;
  totalAuthorizedBudget: string;
  totalActualSpend: string;
  totalPendingExposure: string;
  totalAvailableBalance: string;
  totalProjectedBalance: string;
  lines: BudgetLineSpendDTO[];
  expenses: ExpenseSummaryDTO[];
};
