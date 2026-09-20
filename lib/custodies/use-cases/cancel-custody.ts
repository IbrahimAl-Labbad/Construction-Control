/**
 * lib/custodies/use-cases/cancel-custody.ts
 *
 * Use case: Manager cancels an APPROVED custody before cash is disbursed.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively.
 * 2. Pre-issuance guard: Permitted ONLY when status is strictly APPROVED.
 *    (Once ISSUED, cancellation is impossible; must be settled via receipts/cash return).
 * 3. Mandatory reason: cancellationReason required.
 * 4. Terminal state: CANCELLED is an immutable terminal state.
 * 5. Atomicity: Status update + CUSTODY_CANCELLED AuditLog in SAME transaction.
 */

import { CustodyStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  cancelCustodySchema,
  type CancelCustodyInput,
} from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function cancelCustody(input: CancelCustodyInput): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(cancelCustodySchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { id, cancellationReason } = validation.data;

  // 3. Pre-transaction fetch
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, status: true, amount: true },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  // 4. Assert pre-issuance condition & transition (APPROVED -> CANCELLED)
  if (preCheck.status === CustodyStatus.ISSUED) {
    throw new AppError(
      'CANNOT_CANCEL_ISSUED_CUSTODY',
      'لا يمكن إلغاء عهدة تم صرف مبالغها النقدية بالفعل؛ يجب تصفيتها عبر الفواتير أو استرجاع الفائض',
    );
  }

  assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.CANCELLED);

  // 5. Execute atomic cancellation transaction
  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.CANCELLED,
        cancelledById: actor.id,
        cancelledAt: now,
        cancellationReason,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_CANCELLED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          amount: updated.amount.toFixed(2),
          cancellationReason,
          cancelledAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCustodySummaryDTO(cancelled);
}
