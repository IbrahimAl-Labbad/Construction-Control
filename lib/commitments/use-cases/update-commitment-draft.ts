/**
 * lib/commitments/use-cases/update-commitment-draft.ts
 *
 * Use case: Purchasing officer updates an existing Commitment draft.
 *
 * Enforces:
 * 1. Authorization: Role.PURCHASING only.
 * 2. Ownership: Only the user who created the draft can edit it.
 * 3. State check: Commitment must be in DRAFT status and not deleted.
 * 4. Draft Update Invariants (Mandatory Correction 3):
 *    Whenever updateCommitmentDraft executes (especially when changing budgetLineId), revalidate:
 *    - project exists, is ACTIVE, and is not deleted.
 *    - budget exists, is APPROVED, and is not deleted.
 *    - budgetLine exists and belongs to the approved budget of the SAME project.
 *    - commitment projectId remains strictly immutable.
 * 5. Atomicity: Mutation + COMMITMENT_UPDATED AuditLog with deltas in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  commitmentIdSchema,
  updateCommitmentDraftSchema,
  type UpdateCommitmentDraftInput,
} from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import type { CommitmentSummaryDTO } from '../types';

export async function updateCommitmentDraft(
  commitmentId: unknown,
  input: UpdateCommitmentDraftInput,
): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.PURCHASING exclusively
  const actor = await requireRole(Role.PURCHASING);

  // 2. Validate inputs
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const dataValidation = validate(updateCommitmentDraftSchema, input);
  if (!dataValidation.success) {
    throw new ValidationError(dataValidation.errors);
  }
  const data = dataValidation.data;

  // 3. Execute atomic update transaction with invariant revalidation
  const updated = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch current commitment
    const existing = await tx.commitment.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    // 3.2 Verify ownership: only the creator can edit
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تعديل مسودة التزام أنشأها مستخدم آخر');
    }

    // 3.3 Verify state: only DRAFT is editable
    if (existing.status !== CommitmentStatus.DRAFT) {
      throw new AppError(
        'COMMITMENT_NOT_DRAFT',
        `لا يمكن تعديل الالتزام وهو في حالة "${existing.status}"، التعديل متاح فقط للمسودات (DRAFT)`,
      );
    }

    // 3.4 Invariants revalidation (Mandatory Correction 3):
    // - project exists, is ACTIVE, and is not deleted
    if (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    // - budget exists, is APPROVED, and is not deleted
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: existing.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // - budgetLine exists, belongs to the approved budget of the SAME project
    const targetLine = await tx.budgetLine.findFirst({
      where: {
        id: data.budgetLineId,
        budgetId: approvedBudget.id,
      },
      select: { id: true },
    });

    if (!targetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة المحدد غير صالح أو لا يتبع للموازنة المعتمدة لنفس المشروع',
      );
    }

    // 3.5 Calculate deltas for audit logging
    const newAmount = new Prisma.Decimal(data.amount);
    const deltas: Record<string, { from: string | null; to: string | null }> = {};

    if (existing.budgetLineId !== data.budgetLineId) {
      deltas.budgetLineId = { from: existing.budgetLineId, to: data.budgetLineId };
    }
    if (!existing.amount.equals(newAmount)) {
      deltas.amount = { from: existing.amount.toFixed(2), to: newAmount.toFixed(2) };
    }
    if (existing.vendorName !== data.vendorName) {
      deltas.vendorName = { from: existing.vendorName, to: data.vendorName };
    }
    if ((existing.referenceNumber ?? null) !== (data.referenceNumber ?? null)) {
      deltas.referenceNumber = {
        from: existing.referenceNumber ?? null,
        to: data.referenceNumber ?? null,
      };
    }
    if (existing.description !== data.description) {
      deltas.description = { from: existing.description, to: data.description };
    }
    if (existing.commitmentDate.getTime() !== data.commitmentDate.getTime()) {
      deltas.commitmentDate = {
        from: existing.commitmentDate.toISOString(),
        to: data.commitmentDate.toISOString(),
      };
    }

    // 3.6 Update commitment record (projectId remains strictly immutable!)
    const updatedCommitment = await tx.commitment.update({
      where: { id },
      data: {
        budgetLineId: data.budgetLineId,
        vendorName: data.vendorName,
        referenceNumber: data.referenceNumber ?? null,
        amount: newAmount,
        commitmentDate: data.commitmentDate,
        description: data.description,
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

    // 3.7 Write COMMITMENT_UPDATED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COMMITMENT_UPDATED',
        entityType: 'COMMITMENT',
        entityId: updatedCommitment.id,
        metadata: {
          projectId: updatedCommitment.projectId,
          deltas,
          updatedAt: updatedCommitment.updatedAt.toISOString(),
        },
      },
    });

    return updatedCommitment;
  });

  return toCommitmentSummaryDTO(updated);
}
