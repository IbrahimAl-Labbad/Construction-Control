/**
 * lib/commitments/use-cases/delete-commitment-draft.ts
 *
 * Use case: Purchasing officer soft-deletes an unsubmitted Commitment draft.
 *
 * Enforces:
 * 1. Authorization: Role.PURCHASING only.
 * 2. Ownership: Only the creator of the draft can delete it.
 * 3. State check: Only DRAFT commitments can be deleted.
 * 4. Soft-delete policy: Sets deletedAt timestamp (never hard-deletes financial records).
 * 5. Atomicity: Soft delete + COMMITMENT_DELETED AuditLog in SAME transaction.
 */

import { CommitmentStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import type { CommitmentSummaryDTO } from '../types';

export async function deleteCommitmentDraft(commitmentId: unknown): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.PURCHASING exclusively
  const actor = await requireRole(Role.PURCHASING);

  // 2. Validate commitmentId
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic transaction to soft-delete the draft
  const now = new Date();
  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.commitment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك حذف مسودة التزام أنشأها مستخدم آخر');
    }

    if (existing.status !== CommitmentStatus.DRAFT) {
      throw new AppError(
        'COMMITMENT_NOT_DRAFT',
        `لا يمكن حذف الالتزام وهو في حالة "${existing.status}"، الحذف متاح فقط للمسودات (DRAFT)`,
      );
    }

    // Soft delete
    const softDeleted = await tx.commitment.update({
      where: { id },
      data: { deletedAt: now },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    // Write COMMITMENT_DELETED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COMMITMENT_DELETED',
        entityType: 'COMMITMENT',
        entityId: softDeleted.id,
        metadata: {
          projectId: softDeleted.projectId,
          budgetLineId: softDeleted.budgetLineId,
          amount: softDeleted.amount.toFixed(2),
          deletedAt: now.toISOString(),
        },
      },
    });

    return softDeleted;
  });

  return toCommitmentSummaryDTO(deleted);
}
