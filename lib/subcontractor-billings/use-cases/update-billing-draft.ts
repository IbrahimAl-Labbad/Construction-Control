/**
 * lib/subcontractor-billings/use-cases/update-billing-draft.ts
 *
 * Use case: Accountant updates an existing Subcontractor Billing draft.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canManageBillingDraft).
 * 2. Ownership: billing.createdById === actor.id.
 * 3. State: billing must be DRAFT.
 * 4. Immutability: projectId, commitmentId, budgetLineId cannot change.
 * 5. If subcontractorName changes, re-validate against commitment.vendorName (Decision #24).
 * 6. Atomicity: mutation + SUBCONTRACTOR_BILLING_UPDATED AuditLog in SAME transaction.
 */

import { CommitmentStatus, Prisma, SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  billingIdSchema,
  updateBillingDraftSchema,
  type UpdateBillingDraftInput,
} from '@/lib/validation/schemas/subcontractor-billing';

import { toSubcontractorBillingSummaryDTO } from '../mappers';
import type { SubcontractorBillingSummaryDTO } from '../types';

const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function updateBillingDraft(
  billingId: unknown,
  input: UpdateBillingDraftInput,
): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authentication + coarse role authorization
  const actor = await requireAuth();
  if (!policies.canManageBillingDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بتعديل مستخلص مقاول باطن');
  }

  // 2. Validate inputs
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const dataValidation = validate(updateBillingDraftSchema, input);
  if (!dataValidation.success) {
    throw new ValidationError(dataValidation.errors);
  }
  const data = dataValidation.data;

  // 3. Atomic update transaction
  const updated = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch existing billing
    const existing = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdById: true,
        projectId: true,
        budgetLineId: true,
        commitmentId: true,
        subcontractorName: true,
        grossAmount: true,
        referenceNumber: true,
        billingPeriod: true,
        claimDate: true,
        description: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // 3.2 Ownership check
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تعديل مستخلص أنشأه مستخدم آخر');
    }

    // 3.3 State check: only DRAFT is editable
    if (existing.status !== SubcontractorBillingStatus.DRAFT) {
      throw new AppError(
        'RECORD_NOT_EDITABLE',
        `لا يمكن تعديل المستخلص وهو في حالة "${existing.status}"، التعديل متاح فقط للمسودات`,
      );
    }

    // 3.4 Validate new subcontractorName against commitment.vendorName if changed
    const newName = data.subcontractorName.trim();
    if (newName.toLowerCase() !== existing.subcontractorName.trim().toLowerCase()) {
      const commitment = await tx.commitment.findFirst({
        where: { id: existing.commitmentId, status: CommitmentStatus.APPROVED, deletedAt: null },
        select: { vendorName: true },
      });
      if (!commitment) {
        throw new AppError('COMMITMENT_NOT_APPROVED', 'الالتزام المرتبط بالمستخلص غير معتمد');
      }
      if (newName.toLowerCase() !== commitment.vendorName.trim().toLowerCase()) {
        throw new AppError(
          'SUBCONTRACTOR_NAME_MISMATCH',
          `اسم مقاول الباطن "${data.subcontractorName}" لا يطابق اسم المورد في الالتزام "${commitment.vendorName}"`,
        );
      }
    }

    // 3.5 Build audit deltas
    const newAmount = new Prisma.Decimal(data.grossAmount);
    const deltas: Record<string, { from: string | null; to: string | null }> = {};

    if (!existing.grossAmount.equals(newAmount)) {
      deltas.grossAmount = {
        from: existing.grossAmount.toFixed(2),
        to: newAmount.toFixed(2),
      };
    }
    if (newName !== existing.subcontractorName.trim()) {
      deltas.subcontractorName = { from: existing.subcontractorName, to: newName };
    }
    if ((existing.referenceNumber ?? null) !== (data.referenceNumber ?? null)) {
      deltas.referenceNumber = {
        from: existing.referenceNumber ?? null,
        to: data.referenceNumber ?? null,
      };
    }
    if (existing.billingPeriod !== data.billingPeriod) {
      deltas.billingPeriod = { from: existing.billingPeriod, to: data.billingPeriod };
    }
    if (existing.claimDate.getTime() !== data.claimDate.getTime()) {
      deltas.claimDate = {
        from: existing.claimDate.toISOString(),
        to: data.claimDate.toISOString(),
      };
    }
    if (existing.description !== data.description) {
      deltas.description = { from: existing.description, to: data.description };
    }

    // 3.6 Update billing (projectId, budgetLineId, commitmentId are immutable)
    const updatedBilling = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        subcontractorName: newName,
        referenceNumber: data.referenceNumber ?? null,
        billingPeriod: data.billingPeriod,
        claimDate: data.claimDate,
        grossAmount: newAmount,
        description: data.description,
      },
      include: BILLING_INCLUDE,
    });

    // 3.7 Write AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_UPDATED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updatedBilling.id,
        metadata: {
          projectId: updatedBilling.projectId,
          commitmentId: updatedBilling.commitmentId,
          previousGrossAmount: existing.grossAmount.toFixed(2),
          newGrossAmount: updatedBilling.grossAmount.toFixed(2),
          deltas,
          updatedAt: updatedBilling.updatedAt.toISOString(),
        },
      },
    });

    return updatedBilling;
  });

  return toSubcontractorBillingSummaryDTO(updated);
}
