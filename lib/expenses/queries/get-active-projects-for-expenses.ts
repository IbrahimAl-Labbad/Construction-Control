/**
 * lib/expenses/queries/get-active-projects-for-expenses.ts
 *
 * Query: Returns active projects that have an approved budget and their budget lines.
 * Used to populate the Project and Budget Line dropdowns in expense draft creation/editing.
 */

import { BudgetStatus, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { AppError } from '@/lib/errors';
import type { ExpenseBudgetLineInfo, ExpenseProjectInfo } from '../types';

export type ActiveProjectForExpenseDTO = ExpenseProjectInfo & {
  lines: ExpenseBudgetLineInfo[];
};

export async function getActiveProjectsForExpenses(): Promise<ActiveProjectForExpenseDTO[]> {
  const actor = await requireAuth();
  if (!policies.canManageExpenseDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض مشاريع تسجيل المصروفات');
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
