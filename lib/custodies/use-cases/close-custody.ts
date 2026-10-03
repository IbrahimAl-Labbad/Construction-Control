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

import { CustodyStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

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

  // 5. Execute atomic closure transaction
  const now = new Date();
  const closed = await prisma.$transaction(async (tx) => {
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
