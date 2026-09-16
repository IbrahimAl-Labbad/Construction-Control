/**
 * lib/expenses/use-cases/delete-expense-draft.ts
 *
 * Use case: Field staff soft-deletes an existing DRAFT Expense.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: submittedById === actor.id.
 * 3. Status invariant: Allowed ONLY while status === DRAFT.
 * 4. Soft deletion: Sets deletedAt = now(). No hard deletion.
 * 5. Atomicity: Soft delete + EXPENSE_DELETED AuditLog in SAME transaction.
 */

import { ExpenseStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

/**
 * Soft deletes a draft expense.
 */
export async function deleteExpenseDraft(expenseId: unknown): Promise<{ success: true }> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canManageExpenseDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بحذف مسودات المصروفات');
  }

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch existing expense
  const existing = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 4. Ownership check
  if (existing.submittedById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'لا يمكنك حذف مسودة مصروف قام بإنشائها مستخدم آخر',
    );
  }

  // 5. Status check: must be DRAFT
  if (existing.status === ExpenseStatus.APPROVED) {
    throw new AppError('IMMUTABLE_RECORD', 'لا يمكن حذف مصروف معتمد');
  }

  if (existing.status !== ExpenseStatus.DRAFT) {
    throw new AppError(
      'EXPENSE_NOT_DRAFT',
      'لا يمكن حذف المصروف إلا وهو في حالة مسودة (DRAFT)',
    );
  }

  // 6. Atomic transaction: soft delete + audit log
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { deletedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_DELETED',
        entityType: 'EXPENSE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          budgetLineId: existing.budgetLineId,
          amount: existing.amount.toFixed(2),
          deletedAt: now.toISOString(),
        },
      },
    });
  });

  return { success: true };
}
