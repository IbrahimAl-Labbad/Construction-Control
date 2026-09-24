/**
 * lib/progress-reports/use-cases/create-progress-report-draft.ts
 *
 * Use case: Site Engineer creates a new Progress Report draft.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * 1. Role.ENGINEER only (requireEngineer()).
 * 2. Zod validation via createProgressReportDraftSchema.
 * 3. Server-authoritative invariants inside single transaction:
 *    - Project must exist, not deleted, and status === ACTIVE (BD-03 Model C).
 *    - Permissive authoring: no ProjectAssignment or membership checked.
 * 4. Duplicate prevention (BD-01 / BD-14):
 *    - (projectId, reportDate, createdById) application pre-check.
 *    - CANCELLED records permanently occupy slot (BD-08).
 *    - PostgreSQL @@unique constraint safety net.
 *    - Catch targeted P2002 on (projectId, reportDate, createdById) and map to DUPLICATE_PROGRESS_REPORT.
 * 5. Atomicity: Record creation + PROGRESS_REPORT_CREATED AuditLog in SAME transaction.
 */

import { ProgressReportStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireEngineer } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { createProgressReportDraftSchema } from '@/lib/validation/schemas/progress-report';
import {
  formatReportDateString,
  isProgressReportUniqueConstraintViolation,
  toCalendarDate,
} from '../calculations';
import { PROGRESS_REPORT_INCLUDE, toProgressReportDetailDTO } from '../mappers';
import type { CreateProgressReportInput, ProgressReportDetailDTO } from '../types';

export async function createProgressReportDraft(
  input: CreateProgressReportInput,
): Promise<ProgressReportDetailDTO> {
  const actor = await requireEngineer();

  // Validate input schema
  const validation = validate(createProgressReportDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  const calendarDate = toCalendarDate(data.reportDate);

  try {
    const created = await prisma.$transaction(async (tx) => {
      // 1. Verify project exists, not deleted, and is ACTIVE
      const project = await tx.project.findFirst({
        where: { id: data.projectId, deletedAt: null },
        select: { id: true, status: true },
      });

      if (!project) {
        throw new AppError('NOT_FOUND', 'المشروع غير موجود');
      }

      if (project.status !== ProjectStatus.ACTIVE) {
        throw new AppError(
          'INVALID_PROJECT_STATUS',
          `لا يمكن إنشاء تقرير تقدم لمشروع غير نشط (حالة المشروع: ${project.status})`,
        );
      }

      // 2. Application duplicate pre-check (BD-01, BD-08, BD-14)
      // CANCELLED reports permanently occupy the uniqueness slot
      const existing = await tx.progressReport.findFirst({
        where: {
          projectId: data.projectId,
          reportDate: calendarDate,
          createdById: actor.id,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });

      if (existing) {
        throw new AppError(
          'DUPLICATE_PROGRESS_REPORT',
          'يوجد تقرير تقدم مسجل بالفعل لهذا المهندس في هذا المشروع في هذا التاريخ',
        );
      }

      // 3. Create ProgressReport in DRAFT status
      const report = await tx.progressReport.create({
        data: {
          projectId: data.projectId,
          reportDate: calendarDate,
          title: data.title,
          workDescription: data.workDescription,
          progressPercentage: data.progressPercentage ?? null,
          blockers: data.blockers ?? null,
          nextPeriodPlan: data.nextPeriodPlan ?? null,
          weatherCondition: data.weatherCondition ?? null,
          status: ProgressReportStatus.DRAFT,
          createdById: actor.id,
        },
        include: PROGRESS_REPORT_INCLUDE,
      });

      // 4. Write PROGRESS_REPORT_CREATED AuditLog in SAME transaction
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'PROGRESS_REPORT_CREATED',
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

    return toProgressReportDetailDTO(created);
  } catch (error) {
    if (isProgressReportUniqueConstraintViolation(error)) {
      throw new AppError(
        'DUPLICATE_PROGRESS_REPORT',
        'يوجد تقرير تقدم مسجل بالفعل لهذا المهندس في هذا المشروع في هذا التاريخ',
      );
    }
    throw error;
  }
}
