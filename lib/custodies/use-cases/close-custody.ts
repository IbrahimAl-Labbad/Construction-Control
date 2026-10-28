/**
 * lib/custodies/use-cases/close-custody.ts
 *
 * Use case: Manager executes final administrative closure of a fully SETTLED custody.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively.
 * 2. Pre-condition: Custody must be in SETTLED status (remaining balance is strictly 0.00).
 * 3. Terminal state: CLOSED is strictly terminal and immutable.
 * 4. Atomicity: Status update + CUSTODY_CLOSED AuditLog in SAME transaction.
 */

import { CustodyStatus, ExpenseStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { calculateCustodyBalances } from '../calculations';
import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function closeCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, status: true, amount: true },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  // 4. Assert state machine transition (SETTLED -> CLOSED)
  assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.CLOSED);

  // 5. Execute atomic closure transaction with Custody row lock
  const now = new Date();
  const closed = await prisma.$transaction(async (tx) => {
    if (tx.$queryRaw) {
      const lockedCustodies = await tx.$queryRaw<
        Array<{
          id: string;
          code: string;
          status: CustodyStatus;
          amount: Prisma.Decimal;
          cashReturnedAmount: Prisma.Decimal;
          deletedAt: Date | null;
        }>
      >`
        SELECT id, code, status, amount, "cashReturnedAmount", "deletedAt"
        FROM custodies
        WHERE id = ${id}
        FOR UPDATE
      `;

      const lockedCustody = lockedCustodies[0];
      if (!lockedCustody || lockedCustody.deletedAt !== null) {
        throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
      }

      assertCanTransitionCustodyStatus(lockedCustody.status, CustodyStatus.CLOSED);

      if (tx.expense?.aggregate) {
        const settledAgg = await tx.expense.aggregate({
          where: {
            custodyId: id,
            status: ExpenseStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        });
        const settledAmount = settledAgg._sum.amount ?? new Prisma.Decimal('0.00');
        const { remainingBalance } = calculateCustodyBalances({
          amount: lockedCustody.amount,
          settledExpenses: settledAmount,
          cashReturned: lockedCustody.cashReturnedAmount,
        });

        if (!remainingBalance.equals(0)) {
          throw new AppError(
            'CUSTODY_NOT_FULLY_SETTLED',
            `لا يمكن إغلاق العهدة لأن الرصيد المتبقي لا يساوي صفراً (${remainingBalance.toFixed(2)} ر.س)`,
          );
        }
      }

      if (tx.expense?.count) {
        const pendingSubmittedCount = await tx.expense.count({
          where: {
            custodyId: id,
            status: ExpenseStatus.SUBMITTED,
            deletedAt: null,
          },
        });
        if (pendingSubmittedCount > 0) {
          throw new AppError(
            'CUSTODY_HAS_PENDING_EXPENSES',
            'لا يمكن إغلاق العهدة لوجود مصروفات مقدمة قيد الاعتماد مرتبطة بها',
          );
        }
      }
    }

    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.CLOSED,
        closedById: actor.id,
        closedAt: now,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        expenses: {
          where: { deletedAt: null },
          select: { id: true, amount: true, status: true, deletedAt: true },
        },
      },
    });

    if (
      Array.isArray(updated.expenses) &&
      updated.expenses.some((e) => e.status === ExpenseStatus.SUBMITTED && e.deletedAt === null)
    ) {
      throw new AppError(
        'CUSTODY_HAS_PENDING_EXPENSES',
        'لا يمكن إغلاق العهدة لوجود مصروفات مقدمة قيد الاعتماد مرتبطة بها',
      );
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_CLOSED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          closedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  logger.info('custody.closed', {
    custodyId: closed.id,
    code: closed.code,
    actorId: actor.id,
  });

  return toCustodySummaryDTO(closed);
}
