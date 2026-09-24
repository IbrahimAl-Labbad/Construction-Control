/**
 * lib/progress-reports/queries/get-all-progress-reports.ts
 *
 * Query: Fetches all progress reports across all projects (Global Review Queue).
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - Role.MANAGER only (requireManager()) — BD-17, BD-20.
 * - Global Manager queue is REQUIRED.
 * - Filter by project (optional) and status (optional).
 * - Ordering: reportDate DESC, createdAt DESC (BD-19).
 * - deletedAt IS NULL.
 */

import type { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { PROGRESS_REPORT_INCLUDE, toProgressReportListItemDTO } from '../mappers';
import type { ProgressReportListItemDTO } from '../types';

export async function getAllProgressReports(filters?: {
  projectId?: string | undefined;
  status?: ProgressReportStatus | undefined;
}): Promise<ProgressReportListItemDTO[]> {
  await requireManager();

  const reports = await prisma.progressReport.findMany({
    where: {
      deletedAt: null,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: PROGRESS_REPORT_INCLUDE,
    orderBy: [
      { reportDate: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return reports.map(toProgressReportListItemDTO);
}
