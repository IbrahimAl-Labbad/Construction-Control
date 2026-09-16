/**
 * lib/commitments/queries/get-active-projects-for-commitments.ts
 *
 * Query: Returns active projects that have an approved budget and their budget lines.
 * Used to populate Project and Budget Line dropdowns in commitment draft creation/editing.
 */

import { BudgetStatus, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import type { CommitmentBudgetLineInfo, CommitmentProjectInfo } from '../types';

export type ActiveProjectForCommitmentDTO = CommitmentProjectInfo & {
  lines: CommitmentBudgetLineInfo[];
};

export async function getActiveProjectsForCommitments(): Promise<ActiveProjectForCommitmentDTO[]> {
  const actor = await requireAuth();
  if (!policies.canManageCommitmentDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء مسودات الالتزامات');
  }

  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      deletedAt: null,
      budgets: {
        some: {
          status: BudgetStatus.APPROVED,
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      budgets: {
        where: {
          status: BudgetStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          lines: {
            select: {
              id: true,
              category: true,
              description: true,
              amount: true,
            },
            orderBy: { category: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    lines: (p.budgets[0]?.lines ?? []).map((l) => ({
      id: l.id,
      category: l.category,
      description: l.description,
      amount: l.amount.toFixed(2),
    })),
  }));
}
