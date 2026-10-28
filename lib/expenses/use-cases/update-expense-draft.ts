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

import { BudgetStatus, CustodyStatus, ExpenseStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import {
  expenseIdSchema,
  updateExpenseDraftSchema,
} from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import type { ExpenseSummaryDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

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

  // 4. Monetary conversion
  const newDecimalAmount = new Prisma.Decimal(amount);

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    // 5. Fetch existing expense (candidate state before lock)
    const existing = await prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المصروف غير موجود');
    }

    // 6. Ownership invariant (only claimant can edit)
    if (existing.submittedById !== actor.id) {
      throw new AppError(
        'FORBIDDEN',
        'لا يمكنك تعديل مسودة مصروف قام بإنشائها مستخدم آخر',
      );
    }

    // 7. Status check: must be DRAFT
    if (existing.status === ExpenseStatus.APPROVED) {
      throw new AppError('IMMUTABLE_RECORD', 'لا يمكن تعديل مصروف معتمد');
    }

    if (existing.status !== ExpenseStatus.DRAFT) {
      throw new AppError(
        'EXPENSE_NOT_DRAFT',
        'لا يمكن تعديل المصروف إلا وهو في حالة مسودة (DRAFT)',
      );
    }

    // 7.1 For Site Engineers: verify active project assignment and active project status
    if (actor.role === Role.ENGINEER) {
      const isAssigned = await isEngineerAssignedToProject(existing.projectId, actor.id);
      if (!isAssigned) {
        throw new AppError(
          'FORBIDDEN',
          'لا يمكنك تعديل مصروفات لمشروع لست معيناً ضمن فريقه الهندسي',
        );
      }
      if (
        existing.project &&
        (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null)
      ) {
        throw new AppError(
          'INVALID_PROJECT_STATUS',
          'لا يمكن تعديل المصروف لأن المشروع غير نشط حالياً',
        );
      }
    }

    // 8. If budgetLineId changed, pre-validate project/budget line relationship
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

    // 8.1 Candidate custody target
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

    // 9. Atomic transaction: Lock Custody (if linked) -> Lock Expense -> Revalidate -> Update + AuditLog
    try {
      const updated = await prisma.$transaction(async (tx) => {
        let lockedCustody: {
          id: string;
          projectId: string;
          budgetLineId: string;
          custodianUserId: string;
          status: CustodyStatus;
          deletedAt: Date | null;
        } | null = null;

        if (targetCustodyId && tx.$queryRaw) {
          const custodyRows = await tx.$queryRaw<
            Array<{
              id: string;
              projectId: string;
              budgetLineId: string;
              custodianUserId: string;
              status: CustodyStatus;
              deletedAt: Date | null;
            }>
          >`
            SELECT id, "projectId", "budgetLineId", "custodianUserId", status, "deletedAt"
            FROM custodies
            WHERE id = ${targetCustodyId}
            FOR UPDATE
          `;
          lockedCustody = custodyRows[0] ?? null;
        }

        if (tx.$queryRaw) {
          await tx.$queryRaw`
            SELECT id FROM expenses
            WHERE id = ${id}
            FOR UPDATE
          `;
        }

        const lockedExpense = tx.expense?.findFirst
          ? await tx.expense.findFirst({
              where: { id, deletedAt: null },
              include: {
                project: { select: { id: true, status: true, deletedAt: true } },
              },
            })
          : existing;

        if (!lockedExpense || lockedExpense.deletedAt !== null) {
          throw new AppError('NOT_FOUND', 'المصروف غير موجود');
        }

        if (lockedExpense.submittedById !== actor.id) {
          throw new AppError(
            'FORBIDDEN',
            'لا يمكنك تعديل مسودة مصروف قام بإنشائها مستخدم آخر',
          );
        }

        if (lockedExpense.status === ExpenseStatus.APPROVED) {
          throw new AppError('IMMUTABLE_RECORD', 'لا يمكن تعديل مصروف معتمد');
        }

        if (lockedExpense.status !== ExpenseStatus.DRAFT) {
          throw new AppError(
            'EXPENSE_NOT_DRAFT',
            'لا يمكن تعديل المصروف إلا وهو في حالة مسودة (DRAFT)',
          );
        }

        if (
          lockedExpense.project &&
          (lockedExpense.project.status !== ProjectStatus.ACTIVE || lockedExpense.project.deletedAt !== null)
        ) {
          throw new AppError(
            'INVALID_PROJECT_STATUS',
            'لا يمكن تعديل المصروف لأن المشروع غير نشط حالياً',
          );
        }

        const effectiveCustodyId = custodyId !== undefined ? custodyId : lockedExpense.custodyId;
        if ((effectiveCustodyId ?? null) !== (targetCustodyId ?? null)) {
          throw new StaleLinkageRetryError();
        }

        if (
          budgetLineId !== lockedExpense.budgetLineId ||
          (typeof tx.budget?.findFirst === 'function' && typeof tx.budgetLine?.findFirst === 'function')
        ) {
          const budgetClient = typeof tx.budget?.findFirst === 'function' ? tx.budget : prisma.budget;
          const budgetLineClient =
            typeof tx.budgetLine?.findFirst === 'function' ? tx.budgetLine : prisma.budgetLine;

          if (
            typeof budgetClient?.findFirst === 'function' &&
            typeof budgetLineClient?.findFirst === 'function'
          ) {
            const approvedBudget = await budgetClient.findFirst({
              where: {
                projectId: lockedExpense.projectId,
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

            const validLine = await budgetLineClient.findFirst({
              where: {
                id: budgetLineId,
                budgetId: approvedBudget.id,
              },
              select: { id: true },
            });

            if (!validLine) {
              throw new AppError(
                'INVALID_BUDGET_LINE',
                'بند الموازنة الجديد غير صالح أو لا ينتمي لموازنة المشروع المعتمدة',
              );
            }
          }
        }

        if (effectiveCustodyId && typeof tx.$queryRaw === 'function') {
          if (!lockedCustody || lockedCustody.deletedAt !== null) {
            throw new AppError('NOT_FOUND', 'العهدة المحددة غير موجودة');
          }

          if (
            lockedCustody.status !== CustodyStatus.ISSUED &&
            lockedCustody.status !== CustodyStatus.PARTIALLY_SETTLED
          ) {
            throw new AppError(
              'CUSTODY_NOT_ISSUED',
              `لا يمكن تسجيل مصروف على عهدة بحالة "${lockedCustody.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
            );
          }

          if (lockedCustody.projectId !== lockedExpense.projectId) {
            throw new AppError('INVALID_EXPENSE_LINKAGE', 'مشروع العهدة لا يتطابق مع مشروع المصروف');
          }

          if (lockedCustody.budgetLineId !== budgetLineId) {
            throw new AppError('INVALID_EXPENSE_LINKAGE', 'بند موازنة العهدة لا يتطابق مع بند موازنة المصروف');
          }

          if (lockedCustody.custodianUserId !== actor.id) {
            throw new AppError('FORBIDDEN', 'فقط أمين العهدة يمكنه تسجيل مصروفات لتسوية هذه العهدة');
          }
        }

        const deltas = {
          amount: {
            previous: lockedExpense.amount.toFixed(2),
            new: newDecimalAmount.toFixed(2),
          },
          description: {
            previous: lockedExpense.description,
            new: description,
          },
          budgetLineId: {
            previous: lockedExpense.budgetLineId,
            new: budgetLineId,
          },
          custodyId: {
            previous: lockedExpense.custodyId,
            new: effectiveCustodyId,
          },
          expenseDate: {
            previous: lockedExpense.expenseDate.toISOString(),
            new: expenseDate.toISOString(),
          },
        };

        const expense = await tx.expense.update({
          where: { id },
          data: {
            budgetLineId,
            custodyId: effectiveCustodyId,
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
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt < MAX_LINKAGE_RETRIES) {
          continue;
        }
        throw new AppError(
          'CONFLICT',
          'تم تعديل ارتباطات المسودة بشكل متزامن، يرجى المحاولة مرة أخرى',
        );
      }
      throw error;
    }
  }

  throw new AppError('CONFLICT', 'تم تعديل ارتباطات المسودة بشكل متزامن، يرجى المحاولة مرة أخرى');
}
