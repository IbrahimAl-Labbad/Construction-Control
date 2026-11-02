/**
 * lib/milestones/use-cases/link-progress-report.ts
 *
 * Standalone use case: Link a progress report to a project milestone (CR-08 / BD-17).
 *
 * Enforces:
 * - Role: MANAGER or assigned ENGINEER.
 * - Lock hierarchy order: Project -> ProgressReport -> ProjectMilestone (ID ASC).
 * - Delegates validation and audit emission to syncReportMilestoneLinkages.
 * - Idempotency: Returns existing linkage if already linked without duplicating rows or audit logs.
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth, PermissionError } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { linkProgressReportSchema } from '@/lib/validation/schemas/milestone';
import { acquireMilestoneLinkageLocks, syncReportMilestoneLinkages } from './internal-linkage';

export async function linkProgressReportToMilestone(
  rawInput: unknown,
): Promise<{ success: true; linkageId: string }> {
  // 1. Authorization: Manager or Engineer
  const actor = await requireAuth();
  if (actor.role !== Role.MANAGER && actor.role !== Role.ENGINEER) {
    throw new PermissionError('FORBIDDEN', [Role.MANAGER, Role.ENGINEER], actor.role);
  }

  // 2. Validate input
  const validation = validate(linkProgressReportSchema, rawInput);
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

    // 3.3 Check idempotency: if already linked, return existing linkageId immediately
    const existing = lockedContext.existingLinkages.find(
      (l) => l.milestoneId === milestoneId && l.reportId === reportId,
    );
    if (existing) {
      return { success: true, linkageId: existing.id };
    }

    // 3.4 Target list = existing + this milestone
    const targetMilestoneIds = Array.from(
      new Set([...lockedContext.existingLinkages.map((l) => l.milestoneId), milestoneId]),
    );

    // 3.5 Delegate to syncReportMilestoneLinkages
    await syncReportMilestoneLinkages(tx, {
      actor,
      projectId,
      reportId,
      targetMilestoneIds,
      lockedContext,
    });

    // 3.6 Fetch created linkage
    const created = await tx.progressReportMilestone.findUniqueOrThrow({
      where: {
        reportId_milestoneId: {
          reportId,
          milestoneId,
        },
      },
      select: { id: true },
    });

    return { success: true, linkageId: created.id };
  });
}

export { linkProgressReportToMilestone as linkProgressReport };
