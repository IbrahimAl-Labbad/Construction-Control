/**
 * lib/commitments/use-cases/reject-commitment.ts
 *
 * Use case: Manager rejects a submitted Commitment with an explicit reason.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only.
 * 2. Input validation: rejectionReason required (3-500 chars).
 * 3. State machine transition: SUBMITTED -> REJECTED.
 * 4. Atomicity: Status update + rejection reason + COMMITMENT_REJECTED AuditLog in SAME transaction.
 */

import { CommitmentStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  commitmentIdSchema,
  rejectCommitmentSchema,
  type RejectCommitmentInput,
} from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import { assertCanTransitionCommitmentStatus } from '../state-machine';
import type { CommitmentSummaryDTO } from '../types';

export async function rejectCommitment(
  commitmentId: unknown,
  input: RejectCommitmentInput,
): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate inputs
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const bodyValidation = validate(rejectCommitmentSchema, input);
  if (!bodyValidation.success) {
    throw new ValidationError(bodyValidation.errors);
  }
  const data = bodyValidation.data;

  // 3. Execute atomic rejection transaction
  const now = new Date();
  let rejected;
  try {
    rejected = await prisma.$transaction(async (tx) => {
      const existing = await tx.commitment.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
      }

      // Assert state machine transition (SUBMITTED -> REJECTED)
      assertCanTransitionCommitmentStatus(existing.status, CommitmentStatus.REJECTED);

      // Update status to REJECTED
      const updated = await tx.commitment.update({
        where: { id },
        data: {
          status: CommitmentStatus.REJECTED,
          rejectedById: actor.id,
          rejectedAt: now,
          rejectionReason: data.rejectionReason,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          rejectedBy: { select: { id: true, name: true, email: true } },
          budgetLine: { select: { id: true, category: true, description: true, amount: true } },
          project: { select: { id: true, name: true, code: true } },
        },
      });

      // Write COMMITMENT_REJECTED AuditLog in same transaction
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'COMMITMENT_REJECTED',
          entityType: 'COMMITMENT',
          entityId: updated.id,
          metadata: {
            projectId: updated.projectId,
            budgetLineId: updated.budgetLineId,
            amount: updated.amount.toFixed(2),
            rejectionReason: data.rejectionReason,
            rejectedAt: now.toISOString(),
          },
        },
      });

      return updated;
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('commitment.rejection_transaction_failed', {
        commitmentId: id,
        actorId: actor.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  logger.info('commitment.rejected', {
    commitmentId: rejected.id,
    projectId: rejected.projectId,
    actorId: actor.id,
  });

  return toCommitmentSummaryDTO(rejected);
}
