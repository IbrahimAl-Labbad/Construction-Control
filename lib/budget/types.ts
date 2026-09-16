/**
 * lib/budget/types.ts
 *
 * Domain and DTO types for the Project Budget management module.
 * Pure types — no database or server-only runtime dependencies.
 * Follows AGENTS.md §13 (monetary representation) and §26 (client-safe boundary).
 */

import type { BudgetCategory, BudgetStatus } from '@prisma/client';

export type { BudgetStatus, BudgetCategory };

/**
 * Client-safe DTO for a single budget line item.
 * Amount is represented strictly as a string to prevent JavaScript IEEE 754 float precision loss.
 */
export type BudgetLineDTO = {
  id: string;
  budgetId: string;
  category: BudgetCategory;
  description: string;
  amount: string; // e.g. "150000.00"
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Basic user summary included in budget metadata (creator / approver).
 */
export type BudgetUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Client-safe summary representation of a Project Budget.
 */
export type BudgetSummaryDTO = {
  id: string;
  projectId: string;
  version: number;
  status: BudgetStatus;
  totalAmount: string; // e.g. "500000.00"
  currency: string;
  notes: string | null;
  createdById: string;
  createdBy: BudgetUserInfo;
  approvedById: string | null;
  approvedBy: BudgetUserInfo | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lineCount: number;
};

/**
 * Detailed representation of a Project Budget including all its lines.
 */
export type BudgetDetailsDTO = BudgetSummaryDTO & {
  lines: BudgetLineDTO[];
};
