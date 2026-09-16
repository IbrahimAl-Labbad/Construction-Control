/**
 * lib/expenses/use-cases/get-expense.ts
 *
 * Query: Fetches a single Expense by ID.
 *
 * Enforces:
 * 1. Authentication & Authorization: Role.MANAGER, Role.ENGINEER, or Role.ACCOUNTANT.
 * 2. Soft-delete filter: Returns NOT_FOUND if deletedAt !== null.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import type { ExpenseSummaryDTO } from '../types';

export async function getExpense(expenseId: unknown): Promise<ExpenseSummaryDTO> {
  const actor = await requireAuth();
  if (!policies.canViewExpenses(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض بيانات المصروفات');
  }

  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const expense = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
  });

  if (!expense) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  return toExpenseSummaryDTO(expense);
}
