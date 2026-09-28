/**
 * lib/operational-dashboard/queries/get-latest-project-progress-report.ts
 *
 * Dedicated query: Fetches the latest APPROVED progress report snapshot for a project.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strict Architectural Invariants (BD-13-08, BD-13-09, BD-13-16, BD-13-20):
 * - Scoped strictly to matching projectId.
 * - Filtered strictly to status === ProgressReportStatus.APPROVED and deletedAt === null.
 * - Non-approved reports (DRAFT, SUBMITTED, REJECTED, CANCELLED) are NEVER returned.
 * - Narrow projection: only required fields loaded (no PII, no engineer email).
 * - Ordering: reportDate DESC, createdAt DESC, take: 1.
 * - Does NOT call Slice 10 getProjectProgressReports().
 */

import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getBusinessTodayDateString } from '@/lib/milestones/calculations';
import { calculateDaysSinceReport } from '../calculations';
import type { LatestProgressReportSnapshotDTO } from '../types';

/**
 * Fetches the most recent APPROVED progress report snapshot for a given project.
 *
 * @param projectId - The project CUID
 * @returns LatestProgressReportSnapshotDTO if an approved report exists, otherwise null
 */
export async function getLatestProjectProgressReport(
  projectId: string,
): Promise<LatestProgressReportSnapshotDTO | null> {
  const report = await prisma.progressReport.findFirst({
    where: {
      projectId,
      status: ProgressReportStatus.APPROVED,
      deletedAt: null,
    },
    select: {
      id: true,
      reportDate: true,
      title: true,
      progressPercentage: true,
      status: true,
      blockers: true,
      nextPeriodPlan: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          // email is strictly excluded per privacy contract BD-13-16
        },
      },
    },
    orderBy: [
      { reportDate: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  if (!report) {
    return null;
  }

  const reportDateStr = report.reportDate instanceof Date
    ? report.reportDate.toISOString().slice(0, 10)
    : String(report.reportDate).slice(0, 10);

  const businessToday = getBusinessTodayDateString('Asia/Riyadh');
  const daysSinceReport = calculateDaysSinceReport(reportDateStr, businessToday);

  return {
    reportId: report.id,
    reportDate: reportDateStr,
    title: report.title,
    progressPercentage: report.progressPercentage,
    status: 'APPROVED',
    blockers: report.blockers,
    nextPeriodPlan: report.nextPeriodPlan,
    createdBy: {
      id: report.createdBy.id,
      name: report.createdBy.name,
    },
    daysSinceReport,
  };
}
