/**
 * lib/operational-dashboard/types.ts
 *
 * Operational Project Dashboard DTO & Type Contracts.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strict Architectural Invariants (BD-13-14, AGENTS.md §6, §7):
 * - Clean Architecture: ZERO imports from @prisma/client.
 * - Primitive Serialization: All monetary values are Decimal.toFixed(2) strings.
 * - Dates: YYYY-MM-DD strings for calendar dates, ISO-8601 for timestamps.
 * - Currency: Literal 'SAR'.
 * - Closed DTO: Manager-only; NO speculative fields; NO managerId in identity.
 * - Privacy: NO emails, credentials, worker identities, or audit logs.
 */

// ---------------------------------------------------------------------------
// Pure Domain String Literal Unions
// ---------------------------------------------------------------------------

export type ProjectStatusDTO =
  | 'PLANNED'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED';

export type ProgressReportStatusDTO = 'APPROVED';

// ---------------------------------------------------------------------------
// Section Sub-DTOs
// ---------------------------------------------------------------------------

export interface LatestProgressReportSnapshotDTO {
  reportId: string;
  reportDate: string; // YYYY-MM-DD
  title: string;
  progressPercentage: number | null; // Self-reported integer 0–100
  status: ProgressReportStatusDTO; // Always 'APPROVED'
  blockers: string | null;
  nextPeriodPlan: string | null;
  createdBy: {
    id: string;
    name: string; // Name only; email explicitly prohibited per BD-13-16
  };
  daysSinceReport: number; // Integer difference (businessToday - reportDate)
}

export interface ProjectMilestonesSnapshotDTO {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  plannedCount: number;
  overdueCount: number;
  nextUpcomingMilestone: {
    id: string;
    title: string;
    targetDate: string; // YYYY-MM-DD
  } | null;
}

export interface ProjectTeamSnapshotDTO {
  activeEngineerCount: number;
}

export interface ProjectOperationalFinancialDTO {
  hasApprovedBudget: boolean;
  authorizedBudget: string; // Decimal.toFixed(2)
  actualSpend: string; // Decimal.toFixed(2)
  totalActiveExposure: string; // Decimal.toFixed(2)
  availableBalance: string; // Decimal.toFixed(2)
  pendingExposure: string; // Decimal.toFixed(2)
  projectedBalance: string; // Decimal.toFixed(2)
  currency: 'SAR';
}

// ---------------------------------------------------------------------------
// Main Operational Dashboard DTO
// ---------------------------------------------------------------------------

export interface OperationalProjectDashboardDTO {
  projectId: string;
  generatedAt: string; // ISO-8601 string

  identity: {
    code: string;
    name: string;
    status: ProjectStatusDTO;
    managerName: string;
    startDate: string | null; // YYYY-MM-DD
    endDate: string | null; // YYYY-MM-DD
  };

  progress: LatestProgressReportSnapshotDTO | null;

  milestones: ProjectMilestonesSnapshotDTO;

  team: ProjectTeamSnapshotDTO;

  financial: ProjectOperationalFinancialDTO;
}
