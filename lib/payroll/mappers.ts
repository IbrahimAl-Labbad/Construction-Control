/**
 * lib/payroll/mappers.ts
 *
 * Mappers to convert Prisma models to client-safe DTOs for the Payroll module.
 * Ensures all monetary amounts are strings to prevent IEEE 754 float precision loss.
 * Follows AGENTS.md §13 (monetary rules) and §26 (client/server boundary).
 *
 * Enforces:
 * 1. Explicit property mapping (no object spread).
 * 2. Deterministic Arabic period formatting.
 * 3. Exact 2-decimal string serialization for all financial amounts.
 * 4. Distinct full-detail vs reduced list projections.
 * 5. Structural omission of sensitive worker/entry fields from Engineer aggregate summaries.
 */

import type {
  BudgetCategory,
  PayrollEntry,
  PayrollStatus,
  Prisma,
} from '@prisma/client';

import type {
  PayrollDetailDTO,
  PayrollFormDataDTO,
  PayrollListItemDTO,
  ProjectLaborSummaryDTO,
} from './types';

/**
 * Standard include shape for PayrollEntry queries — used across all use-cases.
 */
export const PAYROLL_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export type PayrollEntryWithRelations = PayrollEntry & {
  project?: {
    id: string;
    name: string;
    code: string;
  } | null;
  budgetLine?: {
    id: string;
    category: BudgetCategory;
    description: string;
    amount: Prisma.Decimal;
  } | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  submittedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  rejectedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  cancelledBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

/**
 * Deterministically formats year and month into Arabic Gregorian period text.
 * Uses Western Arabic numerals to match repository standard.
 * Example: (2026, 9) => "سبتمبر 2026"
 */
export function formatArabicPayrollPeriod(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Maps a Prisma PayrollEntry record with relations to a canonical PayrollDetailDTO.
 * Canonical full detail for Manager and Accountant.
 */
export function toPayrollDetailDTO(p: PayrollEntryWithRelations): PayrollDetailDTO {
  return {
    id: p.id,
    projectId: p.projectId,
    project: p.project
      ? {
          id: p.project.id,
          name: p.project.name,
          code: p.project.code,
        }
      : undefined,
    budgetLineId: p.budgetLineId,
    budgetLine: p.budgetLine
      ? {
          id: p.budgetLine.id,
          category: p.budgetLine.category,
          description: p.budgetLine.description,
          amount: p.budgetLine.amount.toFixed(2),
        }
      : undefined,
    workerName: p.workerName,
    workerReference: p.workerReference ?? null,
    tradeOrTitle: p.tradeOrTitle ?? null,
    periodYear: p.periodYear,
    periodMonth: p.periodMonth,
    periodFormattedAr: formatArabicPayrollPeriod(p.periodYear, p.periodMonth),
    amount: p.amount.toFixed(2),
    currency: p.currency,
    description: p.description,
    status: p.status as PayrollStatus,

    createdById: p.createdById,
    createdBy: p.createdBy
      ? {
          id: p.createdBy.id,
          name: p.createdBy.name,
          email: p.createdBy.email,
        }
      : undefined,

    submittedById: p.submittedById ?? null,
    submittedBy: p.submittedBy
      ? {
          id: p.submittedBy.id,
          name: p.submittedBy.name,
          email: p.submittedBy.email,
        }
      : null,
    submittedAt: p.submittedAt ?? null,

    approvedById: p.approvedById ?? null,
    approvedBy: p.approvedBy
      ? {
          id: p.approvedBy.id,
          name: p.approvedBy.name,
          email: p.approvedBy.email,
        }
      : null,
    approvedAt: p.approvedAt ?? null,

    rejectedById: p.rejectedById ?? null,
    rejectedBy: p.rejectedBy
      ? {
          id: p.rejectedBy.id,
          name: p.rejectedBy.name,
          email: p.rejectedBy.email,
        }
      : null,
    rejectedAt: p.rejectedAt ?? null,
    rejectionReason: p.rejectionReason ?? null,

    cancelledById: p.cancelledById ?? null,
    cancelledBy: p.cancelledBy
      ? {
          id: p.cancelledBy.id,
          name: p.cancelledBy.name,
          email: p.cancelledBy.email,
        }
      : null,
    cancelledAt: p.cancelledAt ?? null,
    cancellationReason: p.cancellationReason ?? null,

    deletedAt: p.deletedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Backward-compatibility alias for toPayrollDetailDTO.
 */
export const toPayrollSummaryDTO = toPayrollDetailDTO;

/**
 * Maps a Prisma PayrollEntry record with relations to a reduced PayrollListItemDTO.
 * Used for lightweight table/list views.
 */
export function toPayrollListItemDTO(p: PayrollEntryWithRelations): PayrollListItemDTO {
  return {
    id: p.id,
    projectId: p.projectId,
    project: p.project
      ? {
          id: p.project.id,
          name: p.project.name,
          code: p.project.code,
        }
      : undefined,
    workerName: p.workerName,
    workerReference: p.workerReference ?? null,
    tradeOrTitle: p.tradeOrTitle ?? null,
    periodYear: p.periodYear,
    periodMonth: p.periodMonth,
    periodFormattedAr: formatArabicPayrollPeriod(p.periodYear, p.periodMonth),
    amount: p.amount.toFixed(2),
    currency: p.currency,
    status: p.status as PayrollStatus,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Project Labor Summary Mapper
// ---------------------------------------------------------------------------

export type RawProjectLaborSummaryInput = {
  projectId: string;
  projectName: string;
  projectCode: string;
  totalLaborBudget: Prisma.Decimal | string;
  approvedLaborSpend: Prisma.Decimal | string;
  pendingLaborSpend: Prisma.Decimal | string;
  remainingLaborBudget: Prisma.Decimal | string;
  currency?: string;
  laborBudgetLinesCount?: number;
};

/**
 * Maps project labor financial aggregates to a client-safe ProjectLaborSummaryDTO.
 * Guarantees absence of all worker identities and entry records.
 */
export function toProjectLaborSummaryDTO(
  input: RawProjectLaborSummaryInput,
): ProjectLaborSummaryDTO {
  const toStr = (val: Prisma.Decimal | string): string =>
    typeof val === 'string' ? val : val.toFixed(2);

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    projectCode: input.projectCode,
    totalLaborBudget: toStr(input.totalLaborBudget),
    approvedLaborSpend: toStr(input.approvedLaborSpend),
    pendingLaborSpend: toStr(input.pendingLaborSpend),
    remainingLaborBudget: toStr(input.remainingLaborBudget),
    currency: input.currency ?? 'SAR',
    laborBudgetLinesCount: input.laborBudgetLinesCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Payroll Form Data Mapper
// ---------------------------------------------------------------------------

export type RawPayrollFormDataProject = {
  id: string;
  name: string;
  code: string;
  budgets: Array<{
    lines: Array<{
      id: string;
      description: string;
      amount: Prisma.Decimal;
      category: BudgetCategory;
    }>;
  }>;
};

/**
 * Maps active projects with approved budgets into a PayrollFormDataDTO.
 * Only LABOR lines are mapped.
 */
export function toPayrollFormDataDTO(
  rawProjects: RawPayrollFormDataProject[],
): PayrollFormDataDTO {
  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    laborLines: p.budgets.flatMap((b) =>
      b.lines.map((l) => ({
        id: l.id,
        description: l.description,
        amount: l.amount.toFixed(2),
        category: l.category,
      })),
    ),
  }));

  return { projects };
}
