/**
 * lib/dashboard/mappers.ts
 *
 * Internal accumulator types and DTO mappers for the Executive Dashboard.
 *
 * Responsibilities:
 * - Define server-side accumulators (Decimal-typed, never exported to client)
 * - Map accumulators to client-safe DTOs: Decimal → .toFixed(2), Date → .toISOString()
 * - Guarantee no Prisma types, no Date objects, no Decimal in DTO output
 * - Guarantee no PII (no workerName, workerReference, tradeOrTitle)
 *
 * BD-32: All monetary DTO fields are strings. generatedAt is ISO-8601 string.
 * BD-33: Only aggregate values, counts, project identifiers, and status in DTOs.
 *
 * See AGENTS.md §13 for financial representation rules.
 */

import { Prisma, type ProjectStatus } from '@prisma/client';

import type {
  CompanyFinancialSummaryDTO,
  ExecutiveDashboardDTO,
  PendingApprovalsDTO,
  ProjectFinancialSummaryDTO,
} from './types';

// ---------------------------------------------------------------------------
// Internal accumulator types (server-only — never sent to client)
// ---------------------------------------------------------------------------

/**
 * Mutable accumulator for a single project's financial metrics.
 * All amounts are Prisma.Decimal for exact arithmetic.
 * Converted to strings by toProjectFinancialSummaryDTO().
 */
export type ProjectFinancialAccumulator = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  hasApprovedBudget: boolean;
  authorizedBudget: Prisma.Decimal;
  actualSpend: Prisma.Decimal;
  activeExposure: Prisma.Decimal;
  availableBalance: Prisma.Decimal;
  pendingExposure: Prisma.Decimal;
  projectedBalance: Prisma.Decimal;
};

/**
 * Mutable accumulator for company-wide financial totals.
 * All amounts are Prisma.Decimal for exact arithmetic.
 * Converted to strings by toCompanyFinancialSummaryDTO().
 */
export type CompanyFinancialAccumulator = {
  totalAuthorizedBudget: Prisma.Decimal;
  totalActualSpend: Prisma.Decimal;
  totalActiveExposure: Prisma.Decimal;
  totalAvailableBalance: Prisma.Decimal;
  totalPendingExposure: Prisma.Decimal;
  totalProjectedBalance: Prisma.Decimal;
};

// ---------------------------------------------------------------------------
// Accumulator factories
// ---------------------------------------------------------------------------

/**
 * Creates a zero-initialized company accumulator.
 */
export function createCompanyAccumulator(): CompanyFinancialAccumulator {
  const zero = new Prisma.Decimal('0.00');
  return {
    totalAuthorizedBudget: zero,
    totalActualSpend: zero,
    totalActiveExposure: zero,
    totalAvailableBalance: zero,
    totalPendingExposure: zero,
    totalProjectedBalance: zero,
  };
}

/**
 * Creates a zero-initialized project accumulator for a project without an approved budget.
 */
export function createEmptyProjectAccumulator(
  projectId: string,
  projectCode: string,
  projectName: string,
  projectStatus: ProjectStatus,
): ProjectFinancialAccumulator {
  const zero = new Prisma.Decimal('0.00');
  return {
    projectId,
    projectCode,
    projectName,
    projectStatus,
    hasApprovedBudget: false,
    authorizedBudget: zero,
    actualSpend: zero,
    activeExposure: zero,
    availableBalance: zero,
    pendingExposure: zero,
    projectedBalance: zero,
  };
}

// ---------------------------------------------------------------------------
// DTO mappers — Decimal → string, Date → ISO string
// ---------------------------------------------------------------------------

/**
 * Maps a project-level accumulator to a client-safe DTO.
 * Decimal.toFixed(2) guarantees exactly 2 decimal places.
 * No Date or Decimal objects in output.
 */
export function toProjectFinancialSummaryDTO(
  acc: ProjectFinancialAccumulator,
): ProjectFinancialSummaryDTO {
  return {
    projectId: acc.projectId,
    projectCode: acc.projectCode,
    projectName: acc.projectName,
    projectStatus: acc.projectStatus,
    hasApprovedBudget: acc.hasApprovedBudget,
    authorizedBudget: acc.authorizedBudget.toFixed(2),
    actualSpend: acc.actualSpend.toFixed(2),
    activeExposure: acc.activeExposure.toFixed(2),
    availableBalance: acc.availableBalance.toFixed(2),
    pendingExposure: acc.pendingExposure.toFixed(2),
    projectedBalance: acc.projectedBalance.toFixed(2),
    currency: 'SAR',
  };
}

/**
 * Maps a company-level accumulator to a client-safe DTO.
 */
export function toCompanyFinancialSummaryDTO(
  acc: CompanyFinancialAccumulator,
): CompanyFinancialSummaryDTO {
  return {
    totalAuthorizedBudget: acc.totalAuthorizedBudget.toFixed(2),
    totalActualSpend: acc.totalActualSpend.toFixed(2),
    totalActiveExposure: acc.totalActiveExposure.toFixed(2),
    totalAvailableBalance: acc.totalAvailableBalance.toFixed(2),
    totalPendingExposure: acc.totalPendingExposure.toFixed(2),
    totalProjectedBalance: acc.totalProjectedBalance.toFixed(2),
    currency: 'SAR',
  };
}

/**
 * Assembles the root ExecutiveDashboardDTO from all parts.
 * generatedAt: Date object is converted to ISO-8601 string here — never in the DTO.
 */
export function toExecutiveDashboardDTO(
  companyAcc: CompanyFinancialAccumulator,
  pendingApprovals: PendingApprovalsDTO,
  projectAccumulators: ProjectFinancialAccumulator[],
  generatedAt: Date,
): ExecutiveDashboardDTO {
  return {
    companySummary: toCompanyFinancialSummaryDTO(companyAcc),
    pendingApprovals,
    projects: projectAccumulators
      .map(toProjectFinancialSummaryDTO)
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode, 'ar')),
    generatedAt: generatedAt.toISOString(),
  };
}
