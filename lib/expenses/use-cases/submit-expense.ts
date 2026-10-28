/**
 * lib/expenses/use-cases/submit-expense.ts
 *
 * Use case: Field staff submits a DRAFT Expense for formal manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: submittedById === actor.id (only claimant can submit).
 * 3. State machine transition: DRAFT -> SUBMITTED.
 * 4. Invariant revalidation (Item 10):
 *    - Target project must be ACTIVE and not deleted.
 *    - Target project must have an APPROVED non-deleted budget.
 *    - Target budget line must belong to that approved budget.
 * 5. Atomicity: Status update + EXPENSE_SUBMITTED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, ExpenseStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

import { calculateCustodyBalances } from '@/lib/custodies';
import { toExpenseSummaryDTO } from '../mappers';
import { assertCanTransitionExpenseStatus } from '../state-machine';
import type { ExpenseSummaryDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

/**
 * Submits a draft expense for manager approval.
 */
export async function submitExpense(expenseId: unknown): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canSubmitExpense(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بتقديم مطالبات المصروفات');
  }

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    // 3. Fetch existing expense (candidate state before lock)
    const existing = await prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المصروف غير موجود');
    }

    // 4. Ownership check
    if (existing.submittedById !== actor.id) {
      throw new AppError(
        'FORBIDDEN',
        'لا يمكنك تقديم مصروف قام بإنشائه مستخدم آخر',
      );
    }

    // 4.1 For Site Engineers: verify active project assignment (Slice 14 / BD-14-02)
    if (actor.role === Role.ENGINEER) {
      const isAssigned = await isEngineerAssignedToProject(existing.projectId, actor.id);
      if (!isAssigned) {
        throw new AppError(
          'FORBIDDEN',
          'لا يمكنك تقديم مصروفات لمشروع لست معيناً ضمن فريقه الهندسي',
        );
      }
    }

    // 5. Assert state machine transition
    assertCanTransitionExpenseStatus(existing.status, ExpenseStatus.SUBMITTED);

    // 6. Invariant pre-validation (item 10): Project must be ACTIVE
    if (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null) {
      throw new AppError(
        'INVALID_PROJECT_STATUS',
        'لا يمكن تقديم مصروف لمشروع غير نشط أو محذوف',
      );
    }

    // 7. Invariant pre-validation: Project must have an APPROVED non-deleted budget
    const preApprovedBudget = await prisma.budget.findFirst({
      where: {
        projectId: existing.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!preApprovedBudget) {
      throw new AppError(
        'BUDGET_NOT_APPROVED',
        'لا يمكن تقديم المصروف لأن المشروع لا يمتلك موازنة معتمدة نشطة',
      );
    }

    // 8. Invariant pre-validation: BudgetLine must belong to this approved budget
    const preBudgetLine = await prisma.budgetLine.findFirst({
      where: {
        id: existing.budgetLineId,
        budgetId: preApprovedBudget.id,
      },
      select: { id: true },
    });

    if (!preBudgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة المرتبط بهذا المصروف لم يعد متاحاً أو صالحاً',
      );
    }

    const candidateBudgetLineId = existing.budgetLineId;
    const candidateCustodyId = existing.custodyId ?? null;

    // 9. Atomic transaction: Lock Custody (if linked) -> Lock Expense -> Revalidate -> Update status + Audit log
    const now = new Date();
    try {
      const submitted = await prisma.$transaction(async (tx) => {
        let lockedCustody: {
          id: string;
          code: string;
          projectId: string;
          budgetLineId: string;
          custodianUserId: string;
          amount: Prisma.Decimal;
          cashReturnedAmount: Prisma.Decimal;
          status: CustodyStatus;
          deletedAt: Date | null;
        } | null = null;

        // 9.1 Canonical Lock Order: Custody (Level 4) before Expense (Level 6)
        if (candidateCustodyId) {
          if (tx.$queryRaw) {
            const custodyRows = await tx.$queryRaw<
              Array<{
                id: string;
                code: string;
                projectId: string;
                budgetLineId: string;
                custodianUserId: string;
                amount: Prisma.Decimal;
                cashReturnedAmount: Prisma.Decimal;
                status: CustodyStatus;
                deletedAt: Date | null;
              }>
            >`
              SELECT id, code, "projectId", "budgetLineId", "custodianUserId", amount, "cashReturnedAmount", status, "deletedAt"
              FROM custodies
              WHERE id = ${candidateCustodyId}
              FOR UPDATE
            `;
            lockedCustody = custodyRows[0] ?? null;
          } else {
            const custodyClient = tx.custody ?? prisma.custody;
            if (custodyClient?.findFirst) {
              lockedCustody = (await custodyClient.findFirst({
                where: { id: candidateCustodyId, deletedAt: null },
                select: {
                  id: true,
                  code: true,
                  projectId: true,
                  budgetLineId: true,
                  custodianUserId: true,
                  amount: true,
                  cashReturnedAmount: true,
                  status: true,
                  deletedAt: true,
                },
              })) as typeof lockedCustody;
            }
          }
        }

        // 9.2 Lock Expense row (Level 6)
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
            'لا يمكنك تقديم مصروف قام بإنشائه مستخدم آخر',
          );
        }

        // 9.3 Revalidate state machine transition under lock
        assertCanTransitionExpenseStatus(lockedExpense.status, ExpenseStatus.SUBMITTED);

        // 9.4 Detect concurrent linkage modifications (budgetLineId or custodyId changed while waiting)
        if (
          lockedExpense.budgetLineId !== candidateBudgetLineId ||
          (lockedExpense.custodyId ?? null) !== candidateCustodyId
        ) {
          throw new StaleLinkageRetryError();
        }

        // 9.5 Revalidate project & budget line inside transaction
        if (
          lockedExpense.project &&
          (lockedExpense.project.status !== ProjectStatus.ACTIVE || lockedExpense.project.deletedAt !== null)
        ) {
          throw new AppError(
            'INVALID_PROJECT_STATUS',
            'لا يمكن تقديم مصروف لمشروع غير نشط أو محذوف',
          );
        }

        if (tx.budget?.findFirst && tx.budgetLine?.findFirst) {
          const approvedBudget = await tx.budget.findFirst({
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
              'لا يمكن تقديم المصروف لأن المشروع لا يمتلك موازنة معتمدة نشطة',
            );
          }

          const validLine = await tx.budgetLine.findFirst({
            where: {
              id: lockedExpense.budgetLineId,
              budgetId: approvedBudget.id,
            },
            select: { id: true },
          });

          if (!validLine) {
            throw new AppError(
              'INVALID_BUDGET_LINE',
              'بند الموازنة المرتبط بهذا المصروف لم يعد متاحاً أو صالحاً',
            );
          }
        }

        // 9.6 Revalidate custody invariants & advisory balance headroom under Custody lock
        if (lockedExpense.custodyId) {
          if (!lockedCustody || lockedCustody.deletedAt !== null) {
            throw new AppError('NOT_FOUND', 'العهدة المرتبطة بالمصروف غير موجودة');
          }

          if (
            lockedCustody.status !== CustodyStatus.ISSUED &&
            lockedCustody.status !== CustodyStatus.PARTIALLY_SETTLED
          ) {
            throw new AppError(
              'CUSTODY_NOT_ISSUED',
              `لا يمكن تقديم مصروف مرتبط بعهدة بحالة "${lockedCustody.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
            );
          }

          if (lockedCustody.projectId !== lockedExpense.projectId) {
            throw new AppError('INVALID_EXPENSE_LINKAGE', 'مشروع العهدة لا يتطابق مع مشروع المصروف');
          }

          if (lockedCustody.budgetLineId !== lockedExpense.budgetLineId) {
            throw new AppError('INVALID_EXPENSE_LINKAGE', 'بند موازنة العهدة لا يتطابق مع بند موازنة المصروف');
          }

          if (lockedCustody.custodianUserId !== lockedExpense.submittedById) {
            throw new AppError('FORBIDDEN', 'أمين العهدة فقط هو المخول بتقديم مصروفات لتسوية هذه العهدة');
          }

          const expenseAggClient =
            typeof tx.expense?.aggregate === 'function' ? tx.expense : prisma.expense;
          if (typeof expenseAggClient?.aggregate === 'function') {
            const custodyExpensesAgg = await expenseAggClient.aggregate({
              where: {
                custodyId: lockedCustody.id,
                status: ExpenseStatus.APPROVED,
                deletedAt: null,
              },
              _sum: { amount: true },
            });
            const currentSettled = custodyExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
            const { remainingBalance: remainingAdvance } = calculateCustodyBalances({
              amount: lockedCustody.amount,
              settledExpenses: currentSettled,
              cashReturned: lockedCustody.cashReturnedAmount,
            });

            if (lockedExpense.amount.greaterThan(remainingAdvance)) {
              throw new AppError(
                'CUSTODY_BALANCE_EXCEEDED',
                `مبلغ المصروف (${lockedExpense.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتبقي في العهدة (${remainingAdvance.toFixed(2)} ر.س)`,
              );
            }
          }
        }

        const expense = await tx.expense.update({
          where: { id },
          data: {
            status: ExpenseStatus.SUBMITTED,
            submittedAt: now,
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
            action: 'EXPENSE_SUBMITTED',
            entityType: 'EXPENSE',
            entityId: expense.id,
            metadata: {
              projectId: lockedExpense.projectId,
              budgetLineId: lockedExpense.budgetLineId,
              custodyId: lockedExpense.custodyId ?? null,
              amount: lockedExpense.amount.toFixed(2),
              submittedAt: now.toISOString(),
            },
          },
        });

        return expense;
      });

      return toExpenseSummaryDTO(submitted);
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt < MAX_LINKAGE_RETRIES) {
          continue;
        }
        throw new AppError(
          'CONFLICT',
          'تم تعديل ارتباطات المصروف بشكل متزامن أثناء التقديم، يرجى المحاولة مرة أخرى',
        );
      }
      throw error;
    }
  }

  throw new AppError(
    'CONFLICT',
    'تم تعديل ارتباطات المصروف بشكل متزامن أثناء التقديم، يرجى المحاولة مرة أخرى',
  );
}
