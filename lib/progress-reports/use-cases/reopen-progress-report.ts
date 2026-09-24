/**
 * lib/progress-reports/use-cases/reopen-progress-report.ts
 *
 * Use case: Site Engineer reopens a REJECTED Progress Report back to DRAFT for edits.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Lifecycle: REJECTED → DRAFT
 *
 * Enforces:
 * 1. Role.ENGINEER only (requireEngineer()).
 * 2. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status === REJECTED
 *    - createdById === actor.id (IDOR defense)
 * 3. Clears rejection tracking (rejectedById = null, rejectedAt = null, rejectionReason = null).
 * 4. count === 0 handles NOT_FOUND / IDOR vs INVALID_STATE_TRANSITION.
 * 5. PROGRESS_REPORT_REOPENED AuditLog in SAME transaction.
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

export async function reopenProgressReport(idInput: string): Promise<ProgressReportDetailDTO> {
  const actor = await requireEngineer();

  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  const reopened = await prisma.$transaction(async (tx) => {
    // 1. Atomic compare-and-set update
    const result = await tx.progressReport.updateMany({
      where: {
        id: reportId,
        createdById: actor.id,
        status: ProgressReportStatus.REJECTED,
        deletedAt: null,
      },
      data: {
        status: ProgressReportStatus.DRAFT,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
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
        `لا يمكن إعادة فتح التقرير إلا في حالة مرفوض (الحالة الحالية: ${existing.status})`,
      );
    }

    const report = await tx.progressReport.findUniqueOrThrow({
      where: { id: reportId },
      include: PROGRESS_REPORT_INCLUDE,
    });

    // 2. Write PROGRESS_REPORT_REOPENED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROGRESS_REPORT_REOPENED',
        entityType: 'PROGRESS_REPORT',
        entityId: report.id,
        metadata: {
          projectId: report.projectId,
          reportDate: formatReportDateString(report.reportDate),
          status: ProgressReportStatus.DRAFT,
          createdById: report.createdById,
        },
      },
    });

    return report;
  });

  return toProgressReportDetailDTO(reopened);
}
