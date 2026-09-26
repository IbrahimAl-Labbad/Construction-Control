/**
 * lib/milestones/queries/get-project-milestone-summary.ts
 *
 * Query: Aggregates milestone metrics and the next upcoming milestone for a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - Role-based authorization & Engineer assignment check.
 * - Mandatory: project.deletedAt === null and milestone.deletedAt === null.
 * - nextUpcomingMilestone contract (Section 3 of specification):
 *   - status in [PLANNED, IN_PROGRESS]
 *   - targetDate >= businessToday
 *   - order by targetDate ASC, orderIndex ASC, createdAt ASC
 *   - take 1 (or null if none)
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/milestone';
import {
  formatMilestoneDateString,
  getBusinessTodayDateString,
  isMilestoneOverdue,
  toCalendarDate,
} from '../calculations';
import type { ProjectMilestoneSummaryDTO } from '../types';
import { assertCanViewProjectMilestones } from './query-auth';

export async function getProjectMilestoneSummary(
  projectIdInput: unknown,
): Promise<ProjectMilestoneSummaryDTO> {
  // 1. Validate projectId
  const idValidation = validate(projectIdSchema, projectIdInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const projectId = idValidation.data;

  // 2. Authorization & project active check
  await assertCanViewProjectMilestones(projectId);

  // 3. Operational business calendar date
  const businessTodayStr = getBusinessTodayDateString();
  const businessTodayDate = toCalendarDate(businessTodayStr);

  // 4. Fetch metrics and active milestones in parallel
  const [
    totalCount,
    completedCount,
    inProgressCount,
    plannedCount,
    activeMilestonesForOverdue,
    upcomingCandidate,
  ] = await Promise.all([
    // Total active milestones
    prisma.projectMilestone.count({
      where: {
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
    }),
    // Completed count
    prisma.projectMilestone.count({
      where: {
        projectId,
        status: MilestoneStatus.COMPLETED,
        deletedAt: null,
        project: { deletedAt: null },
      },
    }),
    // In progress count
    prisma.projectMilestone.count({
      where: {
        projectId,
        status: MilestoneStatus.IN_PROGRESS,
        deletedAt: null,
        project: { deletedAt: null },
      },
    }),
    // Planned count
    prisma.projectMilestone.count({
      where: {
        projectId,
        status: MilestoneStatus.PLANNED,
        deletedAt: null,
        project: { deletedAt: null },
      },
    }),
    // Active milestones to calculate overdue count
    prisma.projectMilestone.findMany({
      where: {
        projectId,
        status: { in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS] },
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: {
        targetDate: true,
        status: true,
      },
    }),
    // nextUpcomingMilestone candidate
    prisma.projectMilestone.findFirst({
      where: {
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
        status: { in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS] },
        targetDate: { gte: businessTodayDate },
      },
      orderBy: [
        { targetDate: 'asc' },
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        title: true,
        targetDate: true,
      },
    }),
  ]);

  // 5. Calculate overdue count
  let overdueCount = 0;
  for (const item of activeMilestonesForOverdue) {
    const dStr = formatMilestoneDateString(item.targetDate);
    if (isMilestoneOverdue(dStr, item.status, businessTodayStr)) {
      overdueCount++;
    }
  }

  // 6. Format nextUpcomingMilestone
  const nextUpcoming = upcomingCandidate
    ? {
        id: upcomingCandidate.id,
        title: upcomingCandidate.title,
        targetDate: formatMilestoneDateString(upcomingCandidate.targetDate),
      }
    : null;

  return {
    projectId,
    totalCount,
    completedCount,
    inProgressCount,
    plannedCount,
    overdueCount,
    nextUpcomingMilestone: nextUpcoming,
  };
}
