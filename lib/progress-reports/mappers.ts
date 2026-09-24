/**
 * lib/progress-reports/mappers.ts
 *
 * Mappers for ProgressReport entity to client-safe DTOs.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - reportDate serialized as YYYY-MM-DD string.
 * - All timestamp fields serialized as ISO-8601 strings or null.
 * - No Date objects cross the server/client boundary.
 * - Actor info mapped to { id, name } only — strips email and sensitive details.
 * - No submittedBy / submittedById.
 * - Zero financial data.
 */

import type { Prisma } from '@prisma/client';
import type {
  ProgressReportDetailDTO,
  ProgressReportListItemDTO,
  ReportActorInfo,
} from './types';
import { formatReportDateString } from './calculations';

// ---------------------------------------------------------------------------
// Standard Prisma Include Shape
// ---------------------------------------------------------------------------

export const PROGRESS_REPORT_INCLUDE = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  rejectedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  cancelledBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export type ProgressReportWithRelations = Prisma.ProgressReportGetPayload<{
  include: typeof PROGRESS_REPORT_INCLUDE;
}>;

// ---------------------------------------------------------------------------
// Helper: Map User to ReportActorInfo (Privacy Safe)
// ---------------------------------------------------------------------------

function toActorInfo(user?: { id: string; name: string } | null): ReportActorInfo | undefined {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name,
  };
}

// ---------------------------------------------------------------------------
// Mapper: toProgressReportDetailDTO
// ---------------------------------------------------------------------------

export function toProgressReportDetailDTO(
  entity: ProgressReportWithRelations,
): ProgressReportDetailDTO {
  return {
    id: entity.id,
    projectId: entity.projectId,
    project: entity.project
      ? {
          id: entity.project.id,
          code: entity.project.code,
          name: entity.project.name,
        }
      : undefined,
    reportDate: formatReportDateString(entity.reportDate),
    title: entity.title,
    workDescription: entity.workDescription,
    progressPercentage: entity.progressPercentage,
    blockers: entity.blockers,
    nextPeriodPlan: entity.nextPeriodPlan,
    weatherCondition: entity.weatherCondition,
    status: entity.status,

    createdById: entity.createdById,
    createdBy: toActorInfo(entity.createdBy),

    submittedAt: entity.submittedAt ? entity.submittedAt.toISOString() : null,

    approvedById: entity.approvedById,
    approvedBy: entity.approvedBy ? toActorInfo(entity.approvedBy) : (entity.approvedById ? null : undefined),
    approvedAt: entity.approvedAt ? entity.approvedAt.toISOString() : null,

    rejectedById: entity.rejectedById,
    rejectedBy: entity.rejectedBy ? toActorInfo(entity.rejectedBy) : (entity.rejectedById ? null : undefined),
    rejectedAt: entity.rejectedAt ? entity.rejectedAt.toISOString() : null,
    rejectionReason: entity.rejectionReason,

    cancelledById: entity.cancelledById,
    cancelledBy: entity.cancelledBy ? toActorInfo(entity.cancelledBy) : (entity.cancelledById ? null : undefined),
    cancelledAt: entity.cancelledAt ? entity.cancelledAt.toISOString() : null,
    cancellationReason: entity.cancellationReason,

    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mapper: toProgressReportListItemDTO
// ---------------------------------------------------------------------------

export function toProgressReportListItemDTO(
  entity: ProgressReportWithRelations,
): ProgressReportListItemDTO {
  return {
    id: entity.id,
    projectId: entity.projectId,
    project: entity.project
      ? {
          id: entity.project.id,
          code: entity.project.code,
          name: entity.project.name,
        }
      : undefined,
    reportDate: formatReportDateString(entity.reportDate),
    title: entity.title,
    progressPercentage: entity.progressPercentage,
    status: entity.status,
    createdById: entity.createdById,
    createdBy: toActorInfo(entity.createdBy),
    createdAt: entity.createdAt.toISOString(),
  };
}
