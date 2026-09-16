/**
 * lib/commitments/use-cases/reopen-commitment.ts
 *
 * Use case: Purchasing officer reopens a rejected Commitment draft for modification.
 *
 * Enforces:
 * 1. Authorization: Role.PURCHASING only.
 * 2. Ownership: Only the creator of the draft can reopen it.
 * 3. State machine transition: REJECTED -> DRAFT.
 * 4. Atomicity: Status reset + COMMITMENT_REOPENED AuditLog in SAME transaction.
 */

import { CommitmentStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import { assertCanTransitionCommitmentStatus } from '../state-machine';
import type { CommitmentSummaryDTO } from '../types';

export async function reopenCommitment(commitmentId: unknown): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.PURCHASING exclusively
  const actor = await requireRole(Role.PURCHASING);

  // 2. Validate commitmentId
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic reopen transaction
  const now = new Date();
  const reopened = await prisma.$transaction(async (tx) => {
    const existing = await tx.commitment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    // Verify ownership
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك إعادة فتح مسودة التزام أنشأها مستخدم آخر');
    }

    // Assert state machine transition (REJECTED -> DRAFT)
    assertCanTransitionCommitmentStatus(existing.status, CommitmentStatus.DRAFT);

    // Reset status to DRAFT and clear rejection details
    const updated = await tx.commitment.update({
      where: { id },
      data: {
        status: CommitmentStatus.DRAFT,
        rejectionReason: null,
        rejectedById: null,
        rejectedAt: null,
        submittedById: null,
        submittedAt: null,
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

    // Write COMMITMENT_REOPENED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COMMITMENT_REOPENED',
        entityType: 'COMMITMENT',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          previousRejectionReason: existing.rejectionReason,
          reopenedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCommitmentSummaryDTO(reopened);
}
