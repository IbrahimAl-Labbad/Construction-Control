/**
 * lib/progress-reports/use-cases/cancel-progress-report.ts
 *
 * Use case: Void/cancel a Progress Report (terminal state).
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Lifecycle:
 * - DRAFT → CANCELLED (Engineer cancels own draft, or Manager voids)
 * - SUBMITTED → CANCELLED (Manager voids submitted report)
 * - CANCELLED is strictly terminal and permanently retains its uniqueness slot (BD-08, BD-14).
 *
 * Enforces:
 * 1. Role.ENGINEER (own draft only) or Role.MANAGER (DRAFT or SUBMITTED).
 * 2. Zod validation for ID and cancellation reason.
 * 3. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status in allowed statuses
 *    - createdById === actor.id (if Engineer)
 * 4. Sets cancelledById = actor.id, cancelledAt = now(), cancellationReason.
 * 5. count === 0 handles NOT_FOUND vs INVALID_STATE_TRANSITION.
 * 6. PROGRESS_REPORT_CANCELLED AuditLog in SAME transaction.
 */

import { ProgressReportStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  cancelProgressReportSchema,
  progressReportIdSchema,
} from '@/lib/validation/schemas/progress-report';
import { formatReportDateString } from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { CancelProgressReportInput, ProgressReportDetailDTO } from '../types';

export async function cancelProgressReport(
  idInput: string,
  input?: CancelProgressReportInput,
): Promise<ProgressReportDetailDTO> {
  const actor = await requireAuth();

  if (actor.role !== Role.ENGINEER && actor.role !== Role.MANAGER) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإلغاء تقارير التقدم');
  }

  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  const validation = validate(cancelProgressReportSchema, input ?? {});
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  const isEngineer = actor.role === Role.ENGINEER;

  const cancelled = await prisma.$transaction(async (tx) => {
    const cancellationTime = new Date();

    // 1. Atomic compare-and-set update
    const result = await tx.progressReport.updateMany({
      where: {
        id: reportId,
        deletedAt: null,
        ...(isEngineer
          ? {
              createdById: actor.id,
              status: ProgressReportStatus.DRAFT,
            }
          : {
              status: {
                in: [ProgressReportStatus.DRAFT, ProgressReportStatus.SUBMITTED],
              },
            }),
      },
      data: {
        status: ProgressReportStatus.CANCELLED,
        cancelledById: actor.id,
        cancelledAt: cancellationTime,
        cancellationReason: data.cancellationReason ?? null,
      },
    });

    if (result.count === 0) {
      const existing = await tx.progressReport.findFirst({
        where: {
          id: reportId,
          deletedAt: null,
          ...(isEngineer ? { createdById: actor.id } : {}),
        },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
      }

      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن إلغاء التقرير في حالته الحالية (${existing.status})`,
      );
    }

    const report = await tx.progressReport.findUniqueOrThrow({
      where: { id: reportId },
      include: PROGRESS_REPORT_INCLUDE,
    });

    // 2. Write PROGRESS_REPORT_CANCELLED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROGRESS_REPORT_CANCELLED',
        entityType: 'PROGRESS_REPORT',
        entityId: report.id,
        metadata: {
          projectId: report.projectId,
          reportDate: formatReportDateString(report.reportDate),
          status: ProgressReportStatus.CANCELLED,
          cancelledById: actor.id,
          cancelledAt: cancellationTime.toISOString(),
          cancellationReason: report.cancellationReason,
          createdById: report.createdById,
        },
      },
    });

    return report;
  });

  return toProgressReportDetailDTO(cancelled);
}
