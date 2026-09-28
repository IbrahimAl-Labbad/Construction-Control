/**
 * lib/operational-dashboard/mappers.ts
 *
 * Serialization mappers for the Operational Project Dashboard DTO.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strict Architectural Invariants (BD-13-14, BD-13-16, AGENTS.md §6, §7):
 * - ZERO Prisma objects, Decimal objects, or Date objects in the output DTO.
 * - Dates formatted as YYYY-MM-DD strings.
 * - Identity DTO contains strictly: code, name, status, managerName, startDate, endDate.
 * - NO managerId in identity DTO (strictly reserved as server-only administrative concern).
 * - Manager email, engineer emails, and worker identities are strictly excluded.
 */

import type { ProjectDetails } from '@/lib/projects/types';
import type { ProjectMilestoneSummaryDTO } from '@/lib/milestones/types';
import type {
  LatestProgressReportSnapshotDTO,
  OperationalProjectDashboardDTO,
  ProjectOperationalFinancialDTO,
  ProjectStatusDTO,
} from './types';

/**
 * Formats a Date object or string into YYYY-MM-DD, or null if null/undefined.
 */
function formatDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Assembles the authoritative OperationalProjectDashboardDTO from verified branch results.
 */
export function toOperationalProjectDashboardDTO(params: {
  projectId: string;
  generatedAt: string;
  identityProject: ProjectDetails;
  latestProgress: LatestProgressReportSnapshotDTO | null;
  milestoneSummary: ProjectMilestoneSummaryDTO;
  activeEngineerCount: number;
  financialSummary: ProjectOperationalFinancialDTO;
}): OperationalProjectDashboardDTO {
  const {
    projectId,
    generatedAt,
    identityProject,
    latestProgress,
    milestoneSummary,
    activeEngineerCount,
    financialSummary,
  } = params;

  return {
    projectId,
    generatedAt,
    identity: {
      code: identityProject.code,
      name: identityProject.name,
      status: identityProject.status as ProjectStatusDTO,
      managerName: identityProject.manager?.name ?? 'غير محدد',
      startDate: formatDateString(identityProject.startDate),
      endDate: formatDateString(identityProject.endDate),
      // STRICTLY NO managerId per BD-13-14
    },
    progress: latestProgress,
    milestones: {
      totalCount: milestoneSummary.totalCount,
      completedCount: milestoneSummary.completedCount,
      inProgressCount: milestoneSummary.inProgressCount,
      plannedCount: milestoneSummary.plannedCount,
      overdueCount: milestoneSummary.overdueCount,
      nextUpcomingMilestone: milestoneSummary.nextUpcomingMilestone
        ? {
            id: milestoneSummary.nextUpcomingMilestone.id,
            title: milestoneSummary.nextUpcomingMilestone.title,
            targetDate: milestoneSummary.nextUpcomingMilestone.targetDate,
          }
        : null,
    },
    team: {
      activeEngineerCount,
    },
    financial: financialSummary,
  };
}
