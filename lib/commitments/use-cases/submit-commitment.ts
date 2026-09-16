/**
 * lib/commitments/use-cases/submit-commitment.ts
 *
 * Use case: Purchasing officer submits a Commitment draft for Manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.PURCHASING only.
 * 2. Ownership: Only the creator of the draft can submit it.
 * 3. State machine transition: DRAFT -> SUBMITTED.
 * 4. Active project & approved budget invariant validation.
 * 5. Atomicity: Status update + COMMITMENT_SUBMITTED AuditLog in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import { assertCanTransitionCommitmentStatus } from '../state-machine';
import type { CommitmentSummaryDTO } from '../types';

export async function submitCommitment(commitmentId: unknown): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.PURCHASING exclusively
  const actor = await requireRole(Role.PURCHASING);

  // 2. Validate commitmentId
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic submit transaction
  const now = new Date();
  const submitted = await prisma.$transaction(async (tx) => {
    const existing = await tx.commitment.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    // Verify ownership
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك رفع مسودة التزام أنشأها مستخدم آخر للاعتماد');
    }

    // Assert state machine transition (DRAFT -> SUBMITTED)
    assertCanTransitionCommitmentStatus(existing.status, CommitmentStatus.SUBMITTED);

    // Verify project is ACTIVE
    if (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن رفع التزام لمشروع غير نشط أو محذوف');
    }

    // Verify budget is APPROVED
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

    // Update status to SUBMITTED
    const updated = await tx.commitment.update({
      where: { id },
      data: {
        status: CommitmentStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: now,
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

    // Write COMMITMENT_SUBMITTED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COMMITMENT_SUBMITTED',
        entityType: 'COMMITMENT',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          vendorName: updated.vendorName,
          referenceNumber: updated.referenceNumber,
          submittedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCommitmentSummaryDTO(submitted);
}
