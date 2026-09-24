/**
 * lib/progress-reports/queries/get-active-projects-for-engineer.ts
 *
 * Query: Fetches active projects available for an Engineer to author a progress report.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Enforces:
 * - Role.ENGINEER only (requireEngineer()).
 * - BD-03 Model C: Permissive cross-project authoring.
 *   Any active Engineer may target any ACTIVE, non-deleted project.
 * - No Engineer→Project assignment or membership infrastructure.
 */

import { ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireEngineer } from '@/lib/permissions';
import type { ActiveProjectOptionDTO } from '../types';

export async function getActiveProjectsForEngineer(): Promise<ActiveProjectOptionDTO[]> {
  await requireEngineer();

  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return projects;
}
