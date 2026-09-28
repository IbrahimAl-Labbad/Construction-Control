/**
 * lib/engineer-workspace/queries/get-engineer-assigned-projects.ts
 *
 * Query: Fetches actively assigned projects for the authenticated Site Engineer.
 * Vertical Slice 14 — Site Engineer Security & Scoped Field Operations.
 *
 * Enforces:
 * - Role.ENGINEER authorization (requireRole(Role.ENGINEER)).
 * - Strictly scoped to projects where the engineer has an ACTIVE assignment.
 * - Filters by terminal status: default excludes COMPLETED; includeTerminal=true includes COMPLETED.
 * - CANCELLED and soft-deleted projects are always excluded.
 * - Collects operational metrics: milestone progress, pending submissions, latest report date.
 * - Absolutely zero financial totals or budget balances exposed.
 */

import { AssignmentStatus, CustodyStatus, ExpenseStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/permissions';
import { toEngineerProjectCardDTO } from '../mappers';
import type { EngineerProjectCardDTO, GetAssignedProjectsFilters } from '../types';

export async function getEngineerAssignedProjects(
  filters?: GetAssignedProjectsFilters,
): Promise<EngineerProjectCardDTO[]> {
  const actor = await requireRole(Role.ENGINEER);

  const includeTerminal = filters?.includeTerminal ?? false;
  const allowedProjectStatuses: ProjectStatus[] = includeTerminal
    ? [
        ProjectStatus.PLANNED,
        ProjectStatus.ACTIVE,
        ProjectStatus.ON_HOLD,
        ProjectStatus.COMPLETED,
      ]
    : [ProjectStatus.PLANNED, ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD];

  const assignments = await prisma.projectAssignment.findMany({
    where: {
      engineerId: actor.id,
      status: AssignmentStatus.ACTIVE,
      project: {
        deletedAt: null,
        status: { in: allowedProjectStatuses },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          status: true,
          milestones: {
            where: { deletedAt: null },
            select: { id: true, status: true },
          },
          expenses: {
            where: {
              submittedById: actor.id,
              deletedAt: null,
              status: { in: [ExpenseStatus.DRAFT, ExpenseStatus.SUBMITTED] },
            },
            select: { id: true },
          },
          custodies: {
            where: {
              OR: [{ custodianUserId: actor.id }, { createdById: actor.id }],
              deletedAt: null,
              status: { in: [CustodyStatus.DRAFT, CustodyStatus.SUBMITTED] },
            },
            select: { id: true },
          },
          progressReports: {
            where: {
              createdById: actor.id,
              deletedAt: null,
            },
            select: { reportDate: true },
            orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
        },
      },
    },
    orderBy: {
      project: {
        name: 'asc',
      },
    },
  });

  return assignments.map(toEngineerProjectCardDTO);
}
