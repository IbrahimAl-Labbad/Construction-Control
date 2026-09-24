/**
 * lib/progress-reports/use-cases/update-progress-report-draft.ts
 *
 * Use case: Site Engineer updates an existing Progress Report draft.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * 1. Role.ENGINEER only (requireEngineer()).
 * 2. Zod validation for ID and update payload.
 * 3. Atomic compare-and-set updateMany predicate checking:
 *    - id
 *    - deletedAt IS NULL
 *    - status === DRAFT
 *    - createdById === actor.id (IDOR defense)
 * 4. count === 0 handles NOT_FOUND / IDOR vs INVALID_STATE_TRANSITION.
 * 5. PROGRESS_REPORT_UPDATED AuditLog in SAME transaction.
 */

import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireEngineer } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  progressReportIdSchema,
  updateProgressReportDraftSchema,
} from '@/lib/validation/schemas/progress-report';
import { formatReportDateString } from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { ProgressReportDetailDTO, UpdateProgressReportInput } from '../types';

export async function updateProgressReportDraft(
  idInput: string,
  input: UpdateProgressReportInput,
): Promise<ProgressReportDetailDTO> {
  const actor = await requireEngineer();

  // Validate ID
  const idValidation = validate(progressReportIdSchema, idInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const reportId = idValidation.data;

  // Validate input schema
  const validation = validate(updateProgressReportDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Atomic compare-and-set update
    const result = await tx.progressReport.updateMany({
      where: {
        id: reportId,
        createdById: actor.id,
        status: ProgressReportStatus.DRAFT,
        deletedAt: null,
      },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.workDescription !== undefined ? { workDescription: data.workDescription } : {}),
        ...(data.progressPercentage !== undefined ? { progressPercentage: data.progressPercentage } : {}),
        ...(data.blockers !== undefined ? { blockers: data.blockers } : {}),
        ...(data.nextPeriodPlan !== undefined ? { nextPeriodPlan: data.nextPeriodPlan } : {}),
        ...(data.weatherCondition !== undefined ? { weatherCondition: data.weatherCondition } : {}),
      },
    });

    if (result.count === 0) {
      // Minimal check to distinguish NOT_FOUND/IDOR from INVALID_STATE_TRANSITION
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
        `لا يمكن تعديل التقرير إلا في حالة المسودة (الحالة الحالية: ${existing.status})`,
      );
    }

    // Fetch the updated report with relations
    const report = await tx.progressReport.findUniqueOrThrow({
      where: { id: reportId },
      include: PROGRESS_REPORT_INCLUDE,
    });

    // 2. Write PROGRESS_REPORT_UPDATED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROGRESS_REPORT_UPDATED',
        entityType: 'PROGRESS_REPORT',
        entityId: report.id,
        metadata: {
          projectId: report.projectId,
          reportDate: formatReportDateString(report.reportDate),
          title: report.title,
          status: report.status,
          createdById: report.createdById,
        },
      },
    });

    return report;
  });

  return toProgressReportDetailDTO(updated);
}
