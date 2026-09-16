/**
 * lib/commitments/use-cases/create-commitment-draft.ts
 *
 * Use case: Purchasing officer creates a new Commitment draft.
 *
 * Enforces:
 * 1. Authorization: Role.PURCHASING only (Gate: Engineers, Accountants, Managers cannot create in v1).
 * 2. Zod validation with referenceNumber normalization and positive Decimal money check.
 * 3. Invariants:
 *    - Target project must exist, be ACTIVE, and not deleted.
 *    - Target project must have an active APPROVED budget (not deleted).
 *    - BudgetLine must exist and belong to the project's approved budget.
 * 4. Atomicity: Commitment draft creation + COMMITMENT_CREATED AuditLog in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  createCommitmentDraftSchema,
  type CreateCommitmentDraftInput,
} from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import type { CommitmentSummaryDTO } from '../types';

export async function createCommitmentDraft(
  input: CreateCommitmentDraftInput,
): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.PURCHASING exclusively
  const actor = await requireRole(Role.PURCHASING);

  // 2. Validate input
  const validation = validate(createCommitmentDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  // 3. Execute atomic transaction to verify invariants and create draft
  const commitment = await prisma.$transaction(async (tx) => {
    // 3.1 Verify project exists, is ACTIVE, and not deleted
    const project = await tx.project.findFirst({
      where: { id: data.projectId, deletedAt: null },
      select: { id: true, status: true, code: true, name: true },
    });

    if (!project) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }

    if (project.status !== ProjectStatus.ACTIVE) {
      throw new AppError(
        'INVALID_PROJECT_STATUS',
        `لا يمكن إنشاء التزام لمشروع غير نشط (حالة المشروع الحالية: ${project.status})`,
      );
    }

    // 3.2 Verify project has an APPROVED budget (not deleted)
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: data.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError(
        'BUDGET_NOT_APPROVED',
        'المشروع لا يمتلك موازنة معتمدة نشطة لربط الالتزامات بها',
      );
    }

    // 3.3 Verify budgetLine exists and belongs to the approved budget
    const budgetLine = await tx.budgetLine.findFirst({
      where: {
        id: data.budgetLineId,
        budgetId: approvedBudget.id,
      },
      select: { id: true, category: true, description: true, amount: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة المحدد غير موجود أو لا يتبع للموازنة المعتمدة للمشروع',
      );
    }

    // 3.4 Create Commitment draft
    const newCommitment = await tx.commitment.create({
      data: {
        projectId: data.projectId,
        budgetLineId: data.budgetLineId,
        vendorName: data.vendorName,
        referenceNumber: data.referenceNumber ?? null,
        amount: new Prisma.Decimal(data.amount),
        currency: 'SAR',
        description: data.description,
        commitmentDate: data.commitmentDate,
        status: CommitmentStatus.DRAFT,
        createdById: actor.id,
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

    // 3.5 Write COMMITMENT_CREATED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COMMITMENT_CREATED',
        entityType: 'COMMITMENT',
        entityId: newCommitment.id,
        metadata: {
          projectId: newCommitment.projectId,
          budgetLineId: newCommitment.budgetLineId,
          amount: newCommitment.amount.toFixed(2),
          vendorName: newCommitment.vendorName,
          referenceNumber: newCommitment.referenceNumber,
          createdAt: newCommitment.createdAt.toISOString(),
        },
      },
    });

    return newCommitment;
  });

  return toCommitmentSummaryDTO(commitment);
}
