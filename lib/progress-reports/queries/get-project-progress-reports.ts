/**
 * lib/progress-reports/queries/get-project-progress-reports.ts
 *
 * Query: Fetches progress reports for a specific project.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - Role.MANAGER only (requireManager()).
 * - Project existence check (throws NOT_FOUND if project does not exist or is deleted).
 * - Filter by status (optional).
 * - Ordering: reportDate DESC, createdAt DESC (BD-19).
 * - deletedAt IS NULL.
 */

import type { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/progress-report';
import { PROGRESS_REPORT_INCLUDE, toProgressReportListItemDTO } from '../mappers';
import type { ProgressReportListItemDTO } from '../types';

export async function getProjectProgressReports(
  projectIdInput: string,
  filters?: {
    status?: ProgressReportStatus | undefined;
  },
): Promise<ProgressReportListItemDTO[]> {
  await requireManager();

  const validation = validate(projectIdSchema, projectIdInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const projectId = validation.data;

  // Verify project exists
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  const reports = await prisma.progressReport.findMany({
    where: {
      projectId,
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
