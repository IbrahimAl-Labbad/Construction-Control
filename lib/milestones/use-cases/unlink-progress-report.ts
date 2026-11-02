/**
 * lib/milestones/use-cases/unlink-progress-report.ts
 *
 * Standalone use case: Unlink a progress report from a project milestone (CR-08 / BD-17).
 *
 * Enforces:
 * - Role: MANAGER or assigned ENGINEER.
 * - Lock hierarchy order: Project -> ProgressReport -> ProjectMilestone (ID ASC).
 * - Delegates validation, immutability checks, and audit logging to syncReportMilestoneLinkages.
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth, PermissionError } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { unlinkProgressReportSchema } from '@/lib/validation/schemas/milestone';
import { acquireMilestoneLinkageLocks, syncReportMilestoneLinkages } from './internal-linkage';

export async function unlinkProgressReportFromMilestone(
  rawInput: unknown,
): Promise<{ success: true }> {
  // 1. Authorization: Manager or Engineer
  const actor = await requireAuth();
  if (actor.role !== Role.MANAGER && actor.role !== Role.ENGINEER) {
    throw new PermissionError('FORBIDDEN', [Role.MANAGER, Role.ENGINEER], actor.role);
  }

  // 2. Validate input
  const validation = validate(unlinkProgressReportSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { milestoneId, reportId } = validation.data;
  let inputProjectId = validation.data.projectId;

  // 3. Execute inside atomic transaction
  return await prisma.$transaction(async (tx) => {
    // 3.1 Resolve projectId if omitted
    if (!inputProjectId) {
      const milestone = await tx.projectMilestone.findFirst({
        where: { id: milestoneId, deletedAt: null },
        select: { projectId: true },
      });
      if (!milestone) {
        throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
      }
      inputProjectId = milestone.projectId;
    }

    const projectId = inputProjectId;

    // 3.2 Acquire canonical locks
    const lockedContext = await acquireMilestoneLinkageLocks(tx, {
      projectId,
      reportId,
      targetMilestoneIds: [milestoneId],
    });

    // 3.3 Ensure the linkage exists to unlink
    const existing = lockedContext.existingLinkages.find(
      (l) => l.milestoneId === milestoneId && l.reportId === reportId,
    );
    if (!existing) {
      throw new AppError('NOT_FOUND', 'ارتباط تقرير التقدم بالمحطة غير موجود');
    }

    // 3.4 Target list = existing minus this milestone
    const targetMilestoneIds = lockedContext.existingLinkages
      .map((l) => l.milestoneId)
      .filter((id) => id !== milestoneId);

    // 3.5 Delegate to syncReportMilestoneLinkages
    await syncReportMilestoneLinkages(tx, {
      actor,
      projectId,
      reportId,
      targetMilestoneIds,
      lockedContext,
    });

    return { success: true };
  });
}

export { unlinkProgressReportFromMilestone as unlinkProgressReport };
