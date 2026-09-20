/**
 * lib/custodies/use-cases/reject-custody.ts
 *
 * Use case: Manager rejects a submitted Custody request with a mandatory reason.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively.
 * 2. Separation of duties: Approver/Rejecter cannot be creator or custodian.
 * 3. State transition: SUBMITTED -> REJECTED.
 * 4. Atomicity: Status update + CUSTODY_REJECTED AuditLog in SAME transaction.
 */

import { CustodyStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  rejectCustodySchema,
  type RejectCustodyInput,
} from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function rejectCustody(input: RejectCustodyInput): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(rejectCustodySchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { id, rejectionReason } = validation.data;

  // 3. Pre-transaction fetch
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      status: true,
      createdById: true,
      custodianUserId: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  // 4. Assert separation of duties
  if (preCheck.createdById === actor.id || preCheck.custodianUserId === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد رفض عهدة قام بإنشائها أو عُيّن أميناً لها (مبدأ فصل المهام)',
    );
  }

  // 5. Assert state transition (SUBMITTED -> REJECTED)
  assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.REJECTED);

  // 6. Execute atomic rejection transaction
  const now = new Date();
  const rejected = await prisma.$transaction(async (tx) => {
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.REJECTED,
        rejectedById: actor.id,
        rejectedAt: now,
        rejectionReason,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_REJECTED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          rejectionReason,
          rejectedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCustodySummaryDTO(rejected);
}
