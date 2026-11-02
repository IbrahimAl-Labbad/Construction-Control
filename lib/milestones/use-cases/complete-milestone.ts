/**
 * lib/milestones/use-cases/complete-milestone.ts
 *
 * Use case: Manager marks a milestone as COMPLETED (CR-08 / BD-17).
 * Vertical Slice 12 & CR-08 Visual Progress & Milestone Evidence Linkage.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Milestone must be in status PLANNED or IN_PROGRESS.
 * 3. Parent Project Row Touch / Lock (Level 5) + Milestone row lock (Level 6).
 * 4. Mandatory Visual Evidence Gate:
 *    Must have at least one linked APPROVED report with at least one active,
 *    qualified visual attachment (JPEG/PNG/WebP, PROGRESS_PHOTO or EXECUTION_EVIDENCE).
 * 5. Committed-Outcome Strategy:
 *    - On evidence failure: Writes MILESTONE_COMPLETION_BLOCKED to AuditLog, commits the
 *      transaction to guarantee audit log persistence, and elevates to AppError outside.
 *    - On evidence success: Atomic CAS updateMany to COMPLETED, achievedAt set to server
 *      timestamp new Date(), and MILESTONE_COMPLETED AuditLog containing exact verified IDs.
 * 6. Zero financial side-effects (operational decoupling OD-06D-1).
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError, type ErrorCode } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { milestoneIdSchema } from '@/lib/validation/schemas/milestone';
import {
  evaluateMilestoneVisualEvidence,
  QUALIFIED_EVIDENCE_CATEGORIES,
  QUALIFIED_VISUAL_MIME_TYPES,
  type LinkedReportEvidenceInput,
} from '../evidence-policy';
import {
  MILESTONE_INCLUDE,
  toProjectMilestoneDTO,
  type ProjectMilestoneWithRelations,
  type MilestoneEvidenceMetrics,
} from '../mappers';
import { assertCanTransitionMilestoneStatus } from '../state-machine';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

type CompleteMilestoneOutcome =
  | {
      success: true;
      milestone: ProjectMilestoneWithRelations;
      evidenceMetrics: MilestoneEvidenceMetrics;
    }
  | {
      success: false;
      code: ErrorCode;
      message: string;
    };

export async function completeMilestone(milestoneId: unknown): Promise<ProjectMilestoneDTO> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate ID
  const idValidation = validate(milestoneIdSchema, milestoneId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Atomic transaction with Committed-Outcome strategy
  const outcome = await prisma.$transaction(async (tx): Promise<CompleteMilestoneOutcome> => {
    // 3.1 Fetch existing milestone
    const existing = await tx.projectMilestone.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
    }

    // 3.2 State machine guard
    assertCanTransitionMilestoneStatus(existing.status, MilestoneStatus.COMPLETED);

    // 3.3 Lock parent project (Level 5) and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 3.4 Lock milestone row (Level 6)
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM project_milestones WHERE id = ${id} FOR UPDATE`;
    }

    // 3.5 Query linked reports and their visual evidence
    const linkages = await tx.progressReportMilestone.findMany({
      where: {
        milestoneId: id,
        projectId: existing.projectId,
      },
      select: {
        reportId: true,
      },
    });

    const reportIds = linkages.map((l) => l.reportId);

    // Fetch reports (including status and deletedAt)
    const reports =
      reportIds.length > 0
        ? await tx.progressReport.findMany({
            where: {
              id: { in: reportIds },
              projectId: existing.projectId,
              deletedAt: null,
            },
            select: {
              id: true,
              status: true,
              deletedAt: true,
            },
          })
        : [];

    const approvedReports = reports.filter((r) => r.status === 'APPROVED' && r.deletedAt === null);
    const approvedReportIds = approvedReports.map((r) => r.id);

    // Fetch active visual attachments for approved reports
    const attachments =
      approvedReportIds.length > 0
        ? await tx.attachment.findMany({
            where: {
              ownerType: 'PROGRESS_REPORT',
              ownerId: { in: approvedReportIds },
              projectId: existing.projectId,
              voidedAt: null,
              category: { in: [...QUALIFIED_EVIDENCE_CATEGORIES] },
              mimeType: { in: [...QUALIFIED_VISUAL_MIME_TYPES] },
            },
            select: {
              id: true,
              ownerId: true,
              category: true,
              mimeType: true,
              voidedAt: true,
            },
          })
        : [];

    // Map attachments by reportId (ownerId)
    const attachmentsByReportId = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = attachmentsByReportId.get(att.ownerId) ?? [];
      list.push(att);
      attachmentsByReportId.set(att.ownerId, list);
    }

    const reportInputs: LinkedReportEvidenceInput[] = reports.map((r) => ({
      id: r.id,
      status: r.status,
      deletedAt: r.deletedAt,
      attachments: attachmentsByReportId.get(r.id) ?? [],
    }));

    // 3.6 Evaluate evidence using pure domain policy
    const evaluation = evaluateMilestoneVisualEvidence(reportInputs);

    if (!evaluation.sufficient) {
      // Committed-Outcome: Record blocked attempt in AuditLog and commit
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'MILESTONE_COMPLETION_BLOCKED',
          entityType: 'PROJECT_MILESTONE',
          entityId: id,
          metadata: {
            projectId: existing.projectId,
            currentStatus: existing.status,
            reason: 'MISSING_QUALIFIED_VISUAL_EVIDENCE',
            linkedReportsCount: linkages.length,
            approvedReportsCount: approvedReportIds.length,
            verifiedAttachmentCount: evaluation.verifiedAttachmentCount,
          },
        },
      });

      return {
        success: false,
        code: 'MILESTONE_EVIDENCE_MISSING',
        message:
          'لا يمكن اعتماد إنجاز المحطة بدون تقرير تقدم معتمد يحتوي على أدلة بصرية مؤهلة (صور)',
      };
    }

    // 3.7 Concurrency CAS updateMany with server completion timestamp
    const achievedAt = new Date();
    const updateResult = await tx.projectMilestone.updateMany({
      where: {
        id,
        status: {
          in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS],
        },
        deletedAt: null,
      },
      data: {
        status: MilestoneStatus.COMPLETED,
        achievedAt,
        updatedById: actor.id,
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'تعذر اعتماد إنجاز المحطة لتغير حالتها متزامناً',
      );
    }

    // 3.8 Write MILESTONE_COMPLETED AuditLog with exact verified IDs
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_COMPLETED',
        entityType: 'PROJECT_MILESTONE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          previousStatus: existing.status,
          newStatus: MilestoneStatus.COMPLETED,
          achievedAt: achievedAt.toISOString(),
          verifiedReportIds: evaluation.verifiedReportIds,
          verifiedAttachmentIds: evaluation.verifiedAttachmentIds,
          verifiedAttachmentCount: evaluation.verifiedAttachmentCount,
        },
      },
    });

    // 3.9 Fetch updated entity
    const milestone = await tx.projectMilestone.findUniqueOrThrow({
      where: { id },
      include: MILESTONE_INCLUDE,
    });

    return {
      success: true,
      milestone,
      evidenceMetrics: {
        linkedReportsCount: linkages.length,
        approvedReportsCount: approvedReportIds.length,
        visualAttachmentsCount: evaluation.verifiedAttachmentCount,
        hasSufficientEvidence: true,
      },
    };
  });

  // 4. Post-Commit Error Elevation
  if (!outcome.success) {
    throw new AppError(outcome.code, outcome.message);
  }

  // 5. Return mapped DTO
  return toProjectMilestoneDTO(outcome.milestone, undefined, outcome.evidenceMetrics);
}
