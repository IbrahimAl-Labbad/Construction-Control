/**
 * lib/expenses/queries/get-user-expenses.ts
 *
 * Query: Fetches expense claims submitted by the current authenticated user.
 */

import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/permissions';
import { toExpenseSummaryDTO } from '../mappers';
import type { ExpenseSummaryDTO } from '../types';

export async function getUserExpenses(): Promise<ExpenseSummaryDTO[]> {
  const actor = await requireAuth();

  const expenses = await prisma.expense.findMany({
    where: {
      submittedById: actor.id,
      deletedAt: null,
    },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return expenses.map(toExpenseSummaryDTO);
}
