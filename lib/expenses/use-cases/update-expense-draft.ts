/**
 * lib/expenses/use-cases/update-expense-draft.ts
 *
 * Use case: Field staff updates an existing DRAFT Expense.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: submittedById === actor.id (only original claimant may edit).
 * 3. Status invariant: Allowed ONLY while status === DRAFT.
 * 4. Project immutability: projectId can NEVER be changed after creation.
 * 5. Budget line revalidation: Any change to budgetLineId must revalidate:
 *    - Project has an APPROVED non-deleted budget.
 *    - Budget line belongs to that approved budget of the same project.
 * 6. Audit deltas: Detailed before/after tracking for amount, description, budgetLineId, expenseDate.
 * 7. Atomicity: Expense update + EXPENSE_UPDATED AuditLog in SAME transaction.
 */

import { BudgetStatus, ExpenseStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  expenseIdSchema,
  updateExpenseDraftSchema,
} from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import type { ExpenseSummaryDTO } from '../types';

/**
 * Updates an existing draft expense.
 */
export async function updateExpenseDraft(
  expenseId: unknown,
  rawInput: unknown,
): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canManageExpenseDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بتعديل مسودات المصروفات');
  }

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate input
  const inputValidation = validate(updateExpenseDraftSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { budgetLineId, custodyId, amount, expenseDate, description } = inputValidation.data;

  // 4. Fetch existing expense
  const existing = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 5. Ownership invariant (only claimant can edit)
  if (existing.submittedById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'لا يمكنك تعديل مسودة مصروف قام بإنشائها مستخدم آخر',
    );
  }

  // 6. Status check: must be DRAFT
  if (existing.status === ExpenseStatus.APPROVED) {
    throw new AppError('IMMUTABLE_RECORD', 'لا يمكن تعديل مصروف معتمد');
  }

  if (existing.status !== ExpenseStatus.DRAFT) {
    throw new AppError(
      'EXPENSE_NOT_DRAFT',
      'لا يمكن تعديل المصروف إلا وهو في حالة مسودة (DRAFT)',
    );
  }

  // 7. If budgetLineId changed, revalidate project/budget line relationship
  if (budgetLineId !== existing.budgetLineId) {
    const approvedBudget = await prisma.budget.findFirst({
      where: {
        projectId: existing.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError(
        'BUDGET_NOT_APPROVED',
        'المشروع لا يمتلك موازنة معتمدة نشطة',
      );
    }

    const budgetLine = await prisma.budgetLine.findFirst({
      where: {
        id: budgetLineId,
        budgetId: approvedBudget.id,
      },
      select: { id: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة الجديد غير صالح أو لا ينتمي لموازنة المشروع المعتمدة',
      );
    }
  }

  // 7.1 If custodyId provided, validate custody invariants
  const targetCustodyId = custodyId !== undefined ? custodyId : existing.custodyId;
  if (targetCustodyId) {
    const custody = await prisma.custody.findFirst({
      where: { id: targetCustodyId, deletedAt: null },
      select: { id: true, projectId: true, budgetLineId: true, custodianUserId: true, status: true },
    });

    if (!custody) {
      throw new AppError('NOT_FOUND', 'العهدة المحددة غير موجودة');
    }

    if (custody.status !== 'ISSUED' && custody.status !== 'PARTIALLY_SETTLED') {
      throw new AppError(
        'CUSTODY_NOT_ISSUED',
        `لا يمكن تسجيل مصروف على عهدة بحالة "${custody.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
      );
    }

    if (custody.projectId !== existing.projectId) {
      throw new AppError('INVALID_EXPENSE_LINKAGE', 'مشروع العهدة لا يتطابق مع مشروع المصروف');
    }

    if (custody.budgetLineId !== budgetLineId) {
      throw new AppError('INVALID_EXPENSE_LINKAGE', 'بند موازنة العهدة لا يتطابق مع بند موازنة المصروف');
    }

    if (custody.custodianUserId !== actor.id) {
      throw new AppError('FORBIDDEN', 'فقط أمين العهدة يمكنه تسجيل مصروفات لتسوية هذه العهدة');
    }
  }

  // 8. Monetary conversion
  const newDecimalAmount = new Prisma.Decimal(amount);

  // 9. Deltas for audit log (item 2 & 33)
  const deltas = {
    amount: {
      previous: existing.amount.toFixed(2),
      new: newDecimalAmount.toFixed(2),
    },
    description: {
      previous: existing.description,
      new: description,
    },
    budgetLineId: {
      previous: existing.budgetLineId,
      new: budgetLineId,
    },
    custodyId: {
      previous: existing.custodyId,
      new: targetCustodyId,
    },
    expenseDate: {
      previous: existing.expenseDate.toISOString(),
      new: expenseDate.toISOString(),
    },
  };

  // 10. Atomic transaction: Update + AuditLog
  const updated = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.update({
      where: { id },
      data: {
        budgetLineId,
        custodyId: targetCustodyId,
        amount: newDecimalAmount,
        expenseDate,
        description,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_UPDATED',
        entityType: 'EXPENSE',
        entityId: expense.id,
        metadata: {
          projectId: expense.projectId,
          deltas,
        },
      },
    });

    return expense;
  });

  return toExpenseSummaryDTO(updated);
}
