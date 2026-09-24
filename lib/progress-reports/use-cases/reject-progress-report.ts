/**
 * lib/progress-reports/use-cases/reject-progress-report.ts
 *
 * Use case: Manager rejects a SUBMITTED Progress Report back to Engineer.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Lifecycle: SUBMITTED → REJECTED
 *
 * Enforces:
 * 1. Role.MANAGER only (requireManager()).
 * 2. Zod validation for ID and rejection payload.
 * 3. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status === SUBMITTED
 * 4. Sets rejectedById = actor.id, rejectedAt = now(), rejectionReason.
 * 5. count === 0 handles NOT_FOUND vs INVALID_STATE_TRANSITION.
 * 6. PROGRESS_REPORT_REJECTED AuditLog in SAME transaction.
 */

import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  progressReportIdSchema,
  rejectProgressReportSchema,
} from '@/lib/validation/schemas/progress-report';
import { formatReportDateString } from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { ProgressReportDetailDTO, RejectProgressReportInput } from '../types';

export async function rejectProgressReport(
  idInput: string,
  input?: RejectProgressReportInput,
): Promise<ProgressReportDetailDTO> {
  const actor = await requireManager();

  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  const validation = validate(rejectProgressReportSchema, input ?? {});
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  const rejected = await prisma.$transaction(async (tx) => {
    const rejectionTime = new Date();

    // 1. Atomic compare-and-set update
    const result = await tx.progressReport.updateMany({
      where: {
        id: reportId,
        status: ProgressReportStatus.SUBMITTED,
        deletedAt: null,
      },
      data: {
        status: ProgressReportStatus.REJECTED,
        rejectedById: actor.id,
        rejectedAt: rejectionTime,
        rejectionReason: data.rejectionReason ?? null,
      },
    });

    if (result.count === 0) {
      const existing = await tx.progressReport.findFirst({
        where: { id: reportId, deletedAt: null },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
      }

      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن رفض التقرير إلا في حالة قيد المراجعة (الحالة الحالية: ${existing.status})`,
      );
    }

    const report = await tx.progressReport.findUniqueOrThrow({
      where: { id: reportId },
      include: PROGRESS_REPORT_INCLUDE,
    });

    // 2. Write PROGRESS_REPORT_REJECTED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROGRESS_REPORT_REJECTED',
        entityType: 'PROGRESS_REPORT',
        entityId: report.id,
        metadata: {
          projectId: report.projectId,
          reportDate: formatReportDateString(report.reportDate),
          status: ProgressReportStatus.REJECTED,
          rejectedById: actor.id,
          rejectedAt: rejectionTime.toISOString(),
          rejectionReason: report.rejectionReason,
          createdById: report.createdById,
        },
      },
    });

    return report;
  });

  return toProgressReportDetailDTO(rejected);
}
