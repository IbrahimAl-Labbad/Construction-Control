/**
 * lib/custodies/queries/get-active-projects-for-custodies.ts
 *
 * Query: Returns active projects with approved budgets/lines, and active eligible custodians.
 * Used to populate Project, BudgetLine, and Custodian dropdowns in custody request forms.
 */

import { BudgetStatus, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import type { CustodyBudgetLineInfo, CustodyProjectInfo, CustodyUserInfo } from '../types';

export type ActiveProjectForCustodyDTO = CustodyProjectInfo & {
  lines: CustodyBudgetLineInfo[];
};

export type CustodyFormDataDTO = {
  projects: ActiveProjectForCustodyDTO[];
  custodians: CustodyUserInfo[];
};

export async function getActiveProjectsForCustodies(): Promise<CustodyFormDataDTO> {
  const actor = await requireAuth();
  if (!policies.canCreateCustody(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء طلبات العهد');
  }

  const [projects, custodians] = await Promise.all([
    prisma.project.findMany({
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
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { in: [Role.ENGINEER, Role.ACCOUNTANT] },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const mappedProjects = projects.map((p) => {
    const approvedBudget = p.budgets[0];
    const lines: CustodyBudgetLineInfo[] = (approvedBudget?.lines ?? []).map((l) => ({
      id: l.id,
      category: l.category,
      description: l.description,
      amount: l.amount.toFixed(2),
    }));

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      lines,
    };
  });

  return {
    projects: mappedProjects,
    custodians,
  };
}
