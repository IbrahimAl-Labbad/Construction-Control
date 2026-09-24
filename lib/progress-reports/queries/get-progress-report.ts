/**
 * lib/progress-reports/queries/get-progress-report.ts
 *
 * Query: Fetches a single Progress Report by ID with full details.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - Server-side authentication (requireAuth()).
 * - Manager: Can view any non-deleted report across all projects (BD-17).
 * - Engineer: Can view own reports only (createdById === actor.id).
 *   IDOR defense: If report does not belong to Engineer, returns NOT_FOUND (BD-18).
 * - Accountant / Purchasing: Strictly denied (BD-16).
 * - deletedAt IS NULL enforced on every query.
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { progressReportIdSchema } from '@/lib/validation/schemas/progress-report';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { ProgressReportDetailDTO } from '../types';

export async function getProgressReport(id: string): Promise<ProgressReportDetailDTO> {
  const actor = await requireAuth();

  // Validate ID
  const validation = validate(progressReportIdSchema, id);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const reportId = validation.data;

  // Authorization check
  if (actor.role !== Role.MANAGER && actor.role !== Role.ENGINEER) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك باستعراض تقارير التقدم');
  }

  // Scoped fetch
  const report = await prisma.progressReport.findFirst({
    where: {
      id: reportId,
      deletedAt: null,
      ...(actor.role === Role.ENGINEER ? { createdById: actor.id } : {}),
    },
    include: PROGRESS_REPORT_INCLUDE,
  });

  if (!report) {
    throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
  }

  return toProgressReportDetailDTO(report);
}
