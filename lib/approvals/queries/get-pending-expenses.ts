/**
 * lib/approvals/queries/get-pending-expenses.ts
 *
 * Fetches paginated pending expense approvals.
 * Lean projection: selects only fields required by ExpenseApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toExpenseApprovalItemDTO } from '../mappers';
import type { ExpenseApprovalItemDTO } from '../types';

export const PENDING_EXPENSES_SELECT = {
  id: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  amount: true,
  currency: true,
  description: true,
  expenseDate: true,
  status: true,
  submittedBy: { select: { name: true } },
  submittedAt: true,
  createdAt: true,
  custody: { select: { code: true } },
} as const;

export async function getPendingExpenses(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: ExpenseApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: PENDING_EXPENSES_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toExpenseApprovalItemDTO({
      id: item.id,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      amount: item.amount,
      currency: item.currency,
      description: item.description,
      expenseDate: item.expenseDate,
      status: item.status,
      submittedBy: item.submittedBy,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
      custody: item.custody,
    })
  );

  return { items, totalItems };
}
