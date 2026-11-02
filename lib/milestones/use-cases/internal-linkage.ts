/**
 * lib/milestones/use-cases/internal-linkage.ts
 *
 * Unified Lock Coordinator & Internal Linkage Synchronization Service (CR-08 / BD-17).
 *
 * Implements:
 * 1. Lock Coordinator: acquireMilestoneLinkageLocks
 *    Enforces strict canonical lock hierarchy order:
 *    Level 5: Project -> Level 6: ProgressReport -> Level 6: ProjectMilestone (ID ASC).
 *
 * 2. Internal Synchronization Service: syncReportMilestoneLinkages
 *    Single source of domain linkage logic shared across standalone use cases
 *    and progress report authoring (create/update draft).
 *
 * Business Rules & Invariants:
 * - Reject duplicate milestone IDs upfront.
 * - Idempotency: Retaining existing linkages executes as a no-op without duplicate inserts or audit logs.
 * - Completed milestone linkage immutability: Any attempt to remove, omit, or replace a linkage
 *   to a COMPLETED milestone is rejected with MILESTONE_COMPLETED_IMMUTABLE.
 * - Cancelled milestone linkage rejection: Cannot link or unlink reports from CANCELLED milestones.
 * - Engineer permissions: Active assignment to project, report owned by Engineer (createdById === actor.id),
 *   and report must be in DRAFT status. (Unassigned/not-creator -> FORBIDDEN; status not DRAFT -> INVALID_STATE_TRANSITION).
 * - Manager permissions: Cannot link a CANCELLED report (INVALID_STATE_TRANSITION). Manager can unlink any report status.
 * - Cross-project isolation: DB composite FK and application guard prevent linking across projects (CROSS_PROJECT_LINKAGE_FORBIDDEN).
 * - Append-only audit trail: MILESTONE_REPORT_LINKED and MILESTONE_REPORT_UNLINKED with full provenance metadata.
 */

import type {
  Prisma,
  ProgressReport,
  ProjectMilestone,
  ProgressReportMilestone,
} from '@prisma/client';
import { MilestoneStatus, Role } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export interface AcquireMilestoneLinkageLocksParams {
  projectId: string;
  reportId?: string | null | undefined;
  targetMilestoneIds?: string[] | undefined;
}

export interface LockedMilestoneLinkageContext {
  projectId: string;
  lockedReport: ProgressReport | null;
  lockedMilestones: Map<string, ProjectMilestone>;
  existingLinkages: ProgressReportMilestone[];
}

/**
 * Acquires row locks once in strict canonical order:
 * Level 5: Project (updatedAt touch via lockProjectForMilestoneMutation)
 * Level 6: ProgressReport (SELECT ... FOR UPDATE) if reportId provided
 * Level 6: ProjectMilestone (SELECT ... FOR UPDATE in deterministic id ASC order)
 */
export async function acquireMilestoneLinkageLocks(
  tx: Prisma.TransactionClient,
  params: AcquireMilestoneLinkageLocksParams,
): Promise<LockedMilestoneLinkageContext> {
  const { projectId, reportId, targetMilestoneIds } = params;

  // 1. Level 5: Lock parent project and verify status [PLANNED, ACTIVE]
  await lockProjectForMilestoneMutation(tx, projectId);

  // 2. Level 6: Progress Report row lock
  let lockedReport: ProgressReport | null = null;
  let existingLinkages: ProgressReportMilestone[] = [];

  if (reportId) {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM progress_reports WHERE id = ${reportId} FOR UPDATE`;
    }

    lockedReport = await tx.progressReport.findFirst({
      where: { id: reportId, deletedAt: null },
    });

    if (!lockedReport) {
      throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
    }

    if (lockedReport.projectId !== projectId) {
      throw new AppError(
        'CROSS_PROJECT_LINKAGE_FORBIDDEN',
        'لا يمكن ربط تقرير بمحطة تابعة لمشروع مختلف',
      );
    }

    existingLinkages = await tx.progressReportMilestone.findMany({
      where: { reportId, projectId },
    });
  }

  // 3. Level 6: Project Milestone row locks in deterministic id ASC order
  const existingMilestoneIds = existingLinkages.map((l) => l.milestoneId);
  const targetIds = targetMilestoneIds ?? [];
  const allMilestoneIds = Array.from(new Set([...targetIds, ...existingMilestoneIds])).sort();

  if (allMilestoneIds.length > 0 && typeof tx.$queryRaw === 'function') {
    for (const mid of allMilestoneIds) {
      await tx.$queryRaw`SELECT id FROM project_milestones WHERE id = ${mid} FOR UPDATE`;
    }
  }

  const milestones =
    allMilestoneIds.length > 0
      ? await tx.projectMilestone.findMany({
          where: {
            id: { in: allMilestoneIds },
            deletedAt: null,
          },
        })
      : [];

  const lockedMilestones = new Map<string, ProjectMilestone>(milestones.map((m) => [m.id, m]));

  return {
    projectId,
    lockedReport,
    lockedMilestones,
    existingLinkages,
  };
}

export interface SyncReportMilestoneLinkagesParams {
  actor: AuthenticatedUser;
  projectId: string;
  reportId: string;
  targetMilestoneIds?: string[] | undefined;
  lockedContext?: LockedMilestoneLinkageContext | undefined;
}

export interface SyncReportMilestoneLinkagesResult {
  linkedCount: number;
  unlinkedCount: number;
  retainedCount: number;
  currentMilestoneIds: string[];
}

/**
 * Unified linkage synchronization service.
 * Operates inside the caller's transaction and enforces all role, state, and relationship invariants.
 */
export async function syncReportMilestoneLinkages(
  tx: Prisma.TransactionClient,
  params: SyncReportMilestoneLinkagesParams,
): Promise<SyncReportMilestoneLinkagesResult> {
  const { actor, projectId, reportId, targetMilestoneIds, lockedContext } = params;

  // 1. If targetMilestoneIds is undefined (omitted in partial update), make zero changes
  if (targetMilestoneIds === undefined) {
    const current = (
      lockedContext?.existingLinkages ??
      (await tx.progressReportMilestone.findMany({
        where: { reportId, projectId },
      }))
    ).map((l) => l.milestoneId);

    return {
      linkedCount: 0,
      unlinkedCount: 0,
      retainedCount: current.length,
      currentMilestoneIds: current,
    };
  }

  // 2. Reject duplicate milestone IDs upfront
  if (new Set(targetMilestoneIds).size !== targetMilestoneIds.length) {
    throw new AppError('VALIDATION_ERROR', 'لا يجوز تكرار معرفات المحطات المرتبطة');
  }

  // 3. Resolve and validate the target report
  const report =
    lockedContext?.lockedReport ??
    (await tx.progressReport.findFirst({
      where: { id: reportId, deletedAt: null },
    }));

  if (!report) {
    throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
  }

  if (report.projectId !== projectId) {
    throw new AppError(
      'CROSS_PROJECT_LINKAGE_FORBIDDEN',
      'لا يمكن ربط تقرير بمحطة تابعة لمشروع مختلف',
    );
  }

  // 4. Role Authorization
  if (actor.role !== Role.MANAGER && actor.role !== Role.ENGINEER) {
    throw new PermissionError('FORBIDDEN', [Role.MANAGER, Role.ENGINEER], actor.role);
  }

  if (actor.role === Role.ENGINEER) {
    // Engineer must be assigned to the project
    const isAssigned = await isEngineerAssignedToProject(projectId, actor.id);
    if (!isAssigned) {
      throw new PermissionError('FORBIDDEN', [Role.MANAGER, Role.ENGINEER], actor.role);
    }

    // Engineer must be the author of this report
    if (report.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بتعديل ارتباطات تقرير مهندس آخر');
    }

    // Engineer can only link or unlink while report is in DRAFT status
    if (report.status !== 'DRAFT') {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'لا يمكن تعديل ارتباطات تقرير تقدم بعد تقديمه أو اعتماده',
      );
    }
  }

  // 5. Partition linkages: toAdd, toRemove, toRetain
  const existingLinkages =
    lockedContext?.existingLinkages ??
    (await tx.progressReportMilestone.findMany({
      where: { reportId, projectId },
    }));

  const existingMap = new Map<string, ProgressReportMilestone>(
    existingLinkages.map((l) => [l.milestoneId, l]),
  );
  const existingMilestoneIds = Array.from(existingMap.keys());

  const toAdd = targetMilestoneIds.filter((id) => !existingMap.has(id));
  const toRemove = existingMilestoneIds.filter((id) => !targetMilestoneIds.includes(id));
  const toRetain = existingMilestoneIds.filter((id) => targetMilestoneIds.includes(id));

  // 6. Manager check for adding new linkages
  if (actor.role === Role.MANAGER && toAdd.length > 0) {
    if (report.status === 'CANCELLED') {
      throw new AppError('INVALID_STATE_TRANSITION', 'لا يمكن ربط تقرير تقدم ملغى بمحطة');
    }
  }

  // 7. Validate removals (toRemove)
  for (const mid of toRemove) {
    const milestone =
      lockedContext?.lockedMilestones.get(mid) ??
      (await tx.projectMilestone.findFirst({
        where: { id: mid, deletedAt: null },
      }));

    // Immutability: Completed milestone linkages cannot be broken
    if (milestone && milestone.status === MilestoneStatus.COMPLETED) {
      throw new AppError(
        'MILESTONE_COMPLETED_IMMUTABLE',
        'لا يمكن تعديل أو فك ارتباط تقرير بمحطة مكتملة',
      );
    }

    // Cancelled milestones cannot be mutated
    if (milestone && milestone.status === MilestoneStatus.CANCELLED) {
      throw new AppError('INVALID_STATE_TRANSITION', 'لا يمكن فك ارتباط تقرير بمحطة ملغاة');
    }
  }

  // 8. Validate additions (toAdd)
  for (const mid of toAdd) {
    const milestone =
      lockedContext?.lockedMilestones.get(mid) ??
      (await tx.projectMilestone.findFirst({
        where: { id: mid, deletedAt: null },
      }));

    if (!milestone) {
      throw new AppError('NOT_FOUND', 'المحطة المستهدفة غير موجودة');
    }

    if (milestone.projectId !== projectId) {
      throw new AppError(
        'CROSS_PROJECT_LINKAGE_FORBIDDEN',
        'لا يمكن ربط تقرير بمحطة تابعة لمشروع مختلف',
      );
    }

    if (milestone.status === MilestoneStatus.COMPLETED) {
      throw new AppError('INVALID_STATE_TRANSITION', 'لا يمكن ربط تقرير بمحطة مكتملة');
    }

    if (milestone.status === MilestoneStatus.CANCELLED) {
      throw new AppError('INVALID_STATE_TRANSITION', 'لا يمكن ربط تقرير بمحطة ملغاة');
    }
  }

  // 9. Execute removals
  for (const mid of toRemove) {
    const joinRow = existingMap.get(mid);
    if (!joinRow) {
      continue;
    }
    await tx.progressReportMilestone.delete({
      where: {
        reportId_milestoneId: {
          reportId,
          milestoneId: mid,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_REPORT_UNLINKED',
        entityType: 'PROGRESS_REPORT_MILESTONE',
        entityId: joinRow.id,
        metadata: {
          linkageId: joinRow.id,
          projectId: joinRow.projectId,
          milestoneId: joinRow.milestoneId,
          reportId: joinRow.reportId,
          linkedById: joinRow.linkedById,
          linkedAt: joinRow.linkedAt.toISOString(),
          unlinkedById: actor.id,
          unlinkedAt: new Date().toISOString(),
        },
      },
    });
  }

  // 10. Execute additions
  for (const mid of toAdd) {
    const joinRow = await tx.progressReportMilestone.create({
      data: {
        projectId,
        reportId,
        milestoneId: mid,
        linkedById: actor.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_REPORT_LINKED',
        entityType: 'PROGRESS_REPORT_MILESTONE',
        entityId: joinRow.id,
        metadata: {
          linkageId: joinRow.id,
          projectId: joinRow.projectId,
          milestoneId: joinRow.milestoneId,
          reportId: joinRow.reportId,
          linkedById: actor.id,
          linkedAt: joinRow.linkedAt.toISOString(),
        },
      },
    });
  }

  // 11. Return sync metrics
  return {
    linkedCount: toAdd.length,
    unlinkedCount: toRemove.length,
    retainedCount: toRetain.length,
    currentMilestoneIds: targetMilestoneIds,
  };
}
