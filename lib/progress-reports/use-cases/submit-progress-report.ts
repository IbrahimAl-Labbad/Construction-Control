/**
 * lib/progress-reports/use-cases/submit-progress-report.ts
 *
 * Use case: Site Engineer submits a DRAFT Progress Report for Manager review.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Lifecycle: DRAFT → SUBMITTED
 *
 * Enforces:
 * 1. Role.ENGINEER only (requireEngineer()).
 * 2. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status === DRAFT
 *    - createdById === actor.id (IDOR defense)
 * 3. Sets submittedAt = now().
 * 4. count === 0 handles NOT_FOUND / IDOR vs INVALID_STATE_TRANSITION.
 * 5. PROGRESS_REPORT_SUBMITTED AuditLog in SAME transaction.
 */

import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireEngineer } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { progressReportIdSchema } from '@/lib/validation/schemas/progress-report';
import { formatReportDateString } from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { ProgressReportDetailDTO } from '../types';

export async function submitProgressReport(idInput: string): Promise<ProgressReportDetailDTO> {
  const actor = await requireEngineer();

  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  const submitted = await prisma.$transaction(async (tx) => {
    const submissionTime = new Date();

    // 1. Atomic compare-and-set update
    const result = await tx.progressReport.updateMany({
      where: {
        id: reportId,
        createdById: actor.id,
        status: ProgressReportStatus.DRAFT,
        deletedAt: null,
      },
      data: {
        status: ProgressReportStatus.SUBMITTED,
        submittedAt: submissionTime,
      },
    });

    if (result.count === 0) {
      const existing = await tx.progressReport.findFirst({
        where: {
          id: reportId,
          createdById: actor.id,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
      }

      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن تقديم التقرير إلا في حالة المسودة (الحالة الحالية: ${existing.status})`,
      );
    }

    const report = await tx.progressReport.findUniqueOrThrow({
      where: { id: reportId },
      include: PROGRESS_REPORT_INCLUDE,
    });

    // 2. Write PROGRESS_REPORT_SUBMITTED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROGRESS_REPORT_SUBMITTED',
        entityType: 'PROGRESS_REPORT',
        entityId: report.id,
        metadata: {
          projectId: report.projectId,
          reportDate: formatReportDateString(report.reportDate),
          status: ProgressReportStatus.SUBMITTED,
          submittedAt: submissionTime.toISOString(),
          createdById: report.createdById,
        },
      },
    });

    return report;
  });

  return toProgressReportDetailDTO(submitted);
}
