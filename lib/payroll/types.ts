/**
 * lib/payroll/types.ts
 *
 * Domain and DTO types for the Payroll Data Entry / Labor Cost Control module.
 * CLIENT-SAFE — no database or server-only runtime dependencies.
 *
 * All monetary amounts are represented as strings (e.g. "1250.00")
 * to prevent IEEE 754 float precision loss at the client boundary.
 *
 * Follows AGENTS.md §13 (monetary representation as string) and
 * §26 (server/client module boundary).
 *
 * Scope boundary (AGENTS.md §3, §4):
 *   Project labor cost capture and budget control only.
 *   HR employee contracts, payroll processing, salary payment,
 *   attendance, deductions, and bank transfers are strictly OUT OF SCOPE.
 */

import type { BudgetCategory, PayrollStatus } from '@prisma/client';

export type { PayrollStatus };

// ---------------------------------------------------------------------------
// Supporting info types
// ---------------------------------------------------------------------------

/**
 * Basic user summary included in payroll audit metadata.
 */
export type PayrollUserInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Basic budget line info attached to a payroll entry.
 */
export type PayrollBudgetLineInfo = {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Authorized BudgetLine ceiling as a string (Decimal). */
  amount: string;
};

/**
 * Basic project info attached to a payroll entry.
 */
export type PayrollProjectInfo = {
  id: string;
  name: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Primary DTO
// ---------------------------------------------------------------------------

/**
 * Canonical client-safe full-detail DTO for a single PayrollEntry record.
 * Used by Manager and Accountant detail views and use-case results.
 * All monetary amounts are strings to prevent IEEE 754 float precision loss.
 */
export type PayrollDetailDTO = {
  id: string;

  projectId: string;
  project?: PayrollProjectInfo | undefined;

  budgetLineId: string;
  budgetLine?: PayrollBudgetLineInfo | undefined;

  /** Worker identification snapshot (plain validated text — no HR master entity) */
  workerName: string;
  workerReference: string | null;
  tradeOrTitle: string | null;

  /** Calendar period */
  periodYear: number;
  periodMonth: number;
  /** Deterministic Arabic formatted period (e.g. "سبتمبر 2026") */
  periodFormattedAr: string;

  /** Monetary labor cost amount in SAR. Positive Decimal(15,2) string representation. */
  amount: string;
  currency: string;

  /** Operational description / site notes */
  description: string;

  /** Operational status of the payroll entry */
  status: PayrollStatus;

  /** Creator tracking (Accountant) */
  createdById: string;
  createdBy?: PayrollUserInfo | undefined;

  /** Submitter tracking */
  submittedById: string | null;
  submittedBy?: PayrollUserInfo | null | undefined;
  submittedAt: Date | null;

  /** Approval tracking (Manager) */
  approvedById: string | null;
  approvedBy?: PayrollUserInfo | null | undefined;
  approvedAt: Date | null;

  /** Rejection tracking */
  rejectedById: string | null;
  rejectedBy?: PayrollUserInfo | null | undefined;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  /** Cancellation tracking */
  cancelledById: string | null;
  cancelledBy?: PayrollUserInfo | null | undefined;
  cancelledAt: Date | null;
  cancellationReason: string | null;

  /** Soft deletion timestamp */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Aliases for consistency and backwards compatibility
export type PayrollSummaryDTO = PayrollDetailDTO;
export type PayrollEntrySummaryDTO = PayrollDetailDTO;

/**
 * Reduced projection for list screens (Manager / Accountant tables).
 * Omits granular tracking relations for lightweight rendering.
 */
export type PayrollListItemDTO = {
  id: string;
  projectId: string;
  project?: PayrollProjectInfo | undefined;
  workerName: string;
  workerReference: string | null;
  tradeOrTitle: string | null;
  periodYear: number;
  periodMonth: number;
  periodFormattedAr: string;
  amount: string;
  currency: string;
  status: PayrollStatus;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Business Identity / Duplicate Key Types
// ---------------------------------------------------------------------------

/**
 * Input fields required to build the BD-10 business identity duplicate key.
 */
export type PayrollDuplicateKeyInput = {
  projectId: string;
  periodYear: number;
  periodMonth: number;
  workerName: string;
};

// ---------------------------------------------------------------------------
// Transition Input / Output Types
// ---------------------------------------------------------------------------

export type PayrollTransitionResult = {
  fromStatus: PayrollStatus;
  toStatus: PayrollStatus;
  timestamp: Date;
};

export type PayrollActionSuccess<T = PayrollDetailDTO> = {
  success: true;
  data: T;
  message?: string;
};

export type PayrollActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: unknown;
};

export type PayrollActionResult<T = PayrollDetailDTO> =
  | PayrollActionSuccess<T>
  | PayrollActionFailure;

// ---------------------------------------------------------------------------
// Summary & Aggregate DTO Types
// ---------------------------------------------------------------------------

/**
 * Client-safe summary of labor budget spend for a project or budget line.
 * All monetary amounts are strings.
 */
export type ProjectLaborSummaryDTO = {
  projectId: string;
  projectName?: string;
  projectCode?: string;
  totalLaborBudget: string;
  approvedLaborSpend: string;
  pendingLaborSpend: string;
  remainingLaborBudget: string;
  currency?: string;
  laborBudgetLinesCount?: number;
};

// ---------------------------------------------------------------------------
// Query Filter & Form Data Types
// ---------------------------------------------------------------------------

export type PayrollEntryFilters = {
  projectId?: string;
  status?: PayrollStatus;
  periodYear?: number;
  periodMonth?: number;
  workerName?: string;
};

export type PayrollFormBudgetLine = {
  id: string;
  description: string;
  amount: string;
  category: BudgetCategory;
};

export type PayrollFormProject = {
  id: string;
  name: string;
  code: string;
  laborLines: PayrollFormBudgetLine[];
};

export type PayrollFormDataDTO = {
  projects: PayrollFormProject[];
};
