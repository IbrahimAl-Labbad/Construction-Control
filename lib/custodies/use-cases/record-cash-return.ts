/**
 * lib/custodies/use-cases/record-cash-return.ts
 *
 * Use case: Accountant records physical return of unused cash from a Custody advance.
 *
 * Enforces Invariants 6, 7:
 * 1. Authorization: Role.ACCOUNTANT exclusively.
 * 2. Exactly one cash return action allowed in v1.
 * 3. Lock Hierarchy (Canonical Order):
 *    1. SELECT id, amount FROM budget_lines WHERE id = ... FOR UPDATE
 *    2. SELECT id, status, amount, cashReturnedAmount FROM custodies WHERE id = ... FOR UPDATE
 * 4. Ceiling Invariant: returned amount <= remaining balance.
 * 5. Automatic settlement trigger if balance reaches exactly 0.00.
 * 6. Atomicity: Cash return + AuditLogs in SAME transaction.
 */

import { CustodyStatus, ExpenseStatus, Prisma, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  recordCashReturnSchema,
  type RecordCashReturnInput,
} from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import type { CustodySummaryDTO } from '../types';

export async function recordCashReturn(input: RecordCashReturnInput): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ACCOUNTANT exclusively
  const actor = await requireRole(Role.ACCOUNTANT);

  // 2. Validate input
  const validation = validate(recordCashReturnSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { id, amount: amountStr } = validation.data;
  const returnAmount = new Prisma.Decimal(amountStr);

  // 3. Pre-transaction fetch
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, status: true, budgetLineId: true },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  if (
    preCheck.status !== CustodyStatus.ISSUED &&
    preCheck.status !== CustodyStatus.PARTIALLY_SETTLED
  ) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن تسجيل استرجاع نقدي لعهدة بحالة "${preCheck.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
    );
  }

  // 4. Execute atomic transaction with Canonical Lock Hierarchy
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // 4.1 Lock parent BudgetLine
    await tx.$queryRaw`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    // 4.2 Lock Custody
    const lockedCustodies = await tx.$queryRaw<
      Array<{
        id: string;
        code: string;
        amount: Prisma.Decimal;
        cashReturnedAmount: Prisma.Decimal;
        status: CustodyStatus;
      }>
    >`
      SELECT id, code, amount, "cashReturnedAmount", status FROM custodies
      WHERE id = ${id}
      FOR UPDATE
    `;

    const lockedCustody = lockedCustodies[0];
    if (!lockedCustody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة');
    }

    // Invariant 6: exactly one cash return in v1
    if (lockedCustody.cashReturnedAmount.greaterThan(0)) {
      throw new AppError(
        'CONFLICT',
        'تم تسجيل استرجاع نقدي لهذه العهدة مسبقاً، لا يمكن تكرار تسجيل استرجاع الفائض في v1',
      );
    }

    // 4.3 Aggregate settled expenses on this custody
    const settledAgg = await tx.expense.aggregate({
      where: {
        custodyId: id,
        status: ExpenseStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    });
    const currentSettled = settledAgg._sum.amount ?? new Prisma.Decimal('0.00');

    // Remaining cash advance in field
    const remainingBalance = lockedCustody.amount.sub(currentSettled);

    // Assert returnAmount <= remainingBalance
    if (returnAmount.greaterThan(remainingBalance)) {
      throw new AppError(
        'CASH_RETURN_EXCEEDS_BALANCE',
        `مبلغ الفائض المسترجع (${returnAmount.toFixed(2)} ر.س) يتجاوز الرصيد المتبقي في العهدة (${remainingBalance.toFixed(2)} ر.س)`,
      );
    }

    const newCashReturned = returnAmount;
    const finalRemaining = remainingBalance.sub(returnAmount);
    const isFullySettled = finalRemaining.equals(0);

    const newStatus = isFullySettled ? CustodyStatus.SETTLED : lockedCustody.status;
    const settledAtDate = isFullySettled ? now : null;

    // 4.4 Update Custody record
    const result = await tx.custody.update({
      where: { id },
      data: {
        cashReturnedAmount: newCashReturned,
        status: newStatus,
        settledAt: settledAtDate,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        expenses: {
          where: { deletedAt: null },
          select: { id: true, amount: true, status: true, deletedAt: true },
        },
      },
    });

    // 4.5 Write CUSTODY_CASH_RETURNED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_CASH_RETURNED',
        entityType: 'CUSTODY',
        entityId: result.id,
        metadata: {
          code: result.code,
          returnedAmount: returnAmount.toFixed(2),
          settledExpenses: currentSettled.toFixed(2),
          newRemainingBalance: finalRemaining.toFixed(2),
          isFullySettled,
          returnedAt: now.toISOString(),
        },
      },
    });

    // 4.6 If fully settled, write CUSTODY_SETTLED audit log
    if (isFullySettled) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'CUSTODY_SETTLED',
          entityType: 'CUSTODY',
          entityId: result.id,
          metadata: {
            code: result.code,
            totalAdvance: result.amount.toFixed(2),
            settledExpenses: currentSettled.toFixed(2),
            cashReturned: returnAmount.toFixed(2),
            settledAt: now.toISOString(),
          },
        },
      });
    }

    return result;
  });

  return toCustodySummaryDTO(updated);
}
