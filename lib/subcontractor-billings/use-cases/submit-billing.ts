/**
 * lib/subcontractor-billings/use-cases/submit-billing.ts
 *
 * Use case: Accountant submits a billing draft for Manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canSubmitBilling).
 * 2. Ownership: billing.createdById === actor.id.
 * 3. State machine transition: DRAFT → SUBMITTED.
 * 4. Sets submittedById and submittedAt.
 * 5. Atomicity: status mutation + SUBCONTRACTOR_BILLING_SUBMITTED AuditLog in SAME transaction.
 */

import { SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { billingIdSchema } from '@/lib/validation/schemas/subcontractor-billing';

import { toSubcontractorBillingSummaryDTO } from '../mappers';
import { assertCanTransitionBillingStatus } from '../state-machine';
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

export async function submitBilling(billingId: unknown): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authentication + coarse role authorization
  const actor = await requireAuth();
  if (!policies.canSubmitBilling(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بتقديم المستخلص للاعتماد');
  }

  // 2. Validate billingId
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Atomic submission transaction
  const now = new Date();
  const submitted = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch billing
    const existing = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdById: true,
        projectId: true,
        commitmentId: true,
        grossAmount: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // 3.2 Ownership check
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تقديم مستخلص أنشأه مستخدم آخر');
    }

    // 3.3 Assert state machine: DRAFT → SUBMITTED
    assertCanTransitionBillingStatus(existing.status, SubcontractorBillingStatus.SUBMITTED);

    // 3.4 Update status to SUBMITTED
    const updatedBilling = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        status: SubcontractorBillingStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: now,
      },
      include: BILLING_INCLUDE,
    });

    // 3.5 Write AuditLog atomically
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_SUBMITTED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updatedBilling.id,
        metadata: {
          projectId: updatedBilling.projectId,
          commitmentId: updatedBilling.commitmentId,
          grossAmount: updatedBilling.grossAmount.toFixed(2),
          submittedAt: now.toISOString(),
        },
      },
    });

    return updatedBilling;
  });

  return toSubcontractorBillingSummaryDTO(submitted);
}
