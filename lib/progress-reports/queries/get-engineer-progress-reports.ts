/**
 * lib/progress-reports/queries/get-engineer-progress-reports.ts
 *
 * Query: Fetches progress reports authored by the authenticated Site Engineer.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - Role.ENGINEER only (requireEngineer()).
 * - Scoped strictly to createdById === actor.id (BD-18).
 * - Filter by status (optional).
 * - Ordering: reportDate DESC, createdAt DESC (BD-19).
 * - deletedAt IS NULL.
 */

import type { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireEngineer } from '@/lib/permissions';
import { PROGRESS_REPORT_INCLUDE, toProgressReportListItemDTO } from '../mappers';
import type { ProgressReportListItemDTO } from '../types';

export async function getEngineerProgressReports(filters?: {
  status?: ProgressReportStatus | undefined;
}): Promise<ProgressReportListItemDTO[]> {
  const actor = await requireEngineer();

  const reports = await prisma.progressReport.findMany({
    where: {
      createdById: actor.id,
      deletedAt: null,
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
