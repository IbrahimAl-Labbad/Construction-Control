/**
 * lib/progress-reports/use-cases/approve-progress-report.ts
 *
 * Use case: Manager approves a SUBMITTED Progress Report.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Lifecycle: SUBMITTED → APPROVED (strictly immutable)
 *
 * Enforces:
 * 1. Role.MANAGER only (requireManager()).
 * 2. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status === SUBMITTED
 * 3. Sets approvedById = actor.id, approvedAt = now().
 * 4. count === 0 handles NOT_FOUND vs INVALID_STATE_TRANSITION.
 * 5. PROGRESS_REPORT_APPROVED AuditLog in SAME transaction.
 */

import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { progressReportIdSchema } from '@/lib/validation/schemas/progress-report';
import { formatReportDateString } from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { ProgressReportDetailDTO } from '../types';

export async function approveProgressReport(idInput: string): Promise<ProgressReportDetailDTO> {
  const actor = await requireManager();

  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  let approved;
  try {
    approved = await prisma.$transaction(async (tx) => {
      const approvalTime = new Date();

      // 1. Atomic compare-and-set update
      const result = await tx.progressReport.updateMany({
        where: {
          id: reportId,
          status: ProgressReportStatus.SUBMITTED,
          deletedAt: null,
        },
        data: {
          status: ProgressReportStatus.APPROVED,
          approvedById: actor.id,
          approvedAt: approvalTime,
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
          `لا يمكن اعتماد التقرير إلا في حالة قيد المراجعة (الحالة الحالية: ${existing.status})`,
        );
      }

      const report = await tx.progressReport.findUniqueOrThrow({
        where: { id: reportId },
        include: PROGRESS_REPORT_INCLUDE,
      });

      // 2. Write PROGRESS_REPORT_APPROVED AuditLog in SAME transaction
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'PROGRESS_REPORT_APPROVED',
          entityType: 'PROGRESS_REPORT',
          entityId: report.id,
          metadata: {
            projectId: report.projectId,
            reportDate: formatReportDateString(report.reportDate),
            status: ProgressReportStatus.APPROVED,
            approvedById: actor.id,
            approvedAt: approvalTime.toISOString(),
            createdById: report.createdById,
          },
        },
      });

      return report;
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('progress_report.approval_transaction_failed', {
        reportId,
        actorId: actor.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  logger.info('progress_report.approved', {
    reportId: approved.id,
    projectId: approved.projectId,
    actorId: actor.id,
  });

  return toProgressReportDetailDTO(approved);
}
