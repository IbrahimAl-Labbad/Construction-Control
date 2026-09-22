/**
 * lib/subcontractor-billings/use-cases/reopen-billing.ts
 *
 * Use case: Accountant reopens a rejected Subcontractor Billing draft for modification.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canManageBillingDraft).
 * 2. Ownership: Only the creator of the billing draft can reopen it.
 * 3. State machine transition: REJECTED -> DRAFT.
 * 4. Atomicity: Status reset + SUBCONTRACTOR_BILLING_REOPENED AuditLog in SAME transaction.
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

export async function reopenBilling(billingId: unknown): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authorization: Role.ACCOUNTANT only
  const actor = await requireAuth();
  if (!policies.canManageBillingDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإعادة فتح المستخلص');
  }

  // 2. Validate billingId
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic reopen transaction
  const now = new Date();
  const reopened = await prisma.$transaction(async (tx) => {
    const existing = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdById: true,
        projectId: true,
        commitmentId: true,
        grossAmount: true,
        rejectionReason: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // Verify ownership
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك إعادة فتح مستخلص أنشأه مستخدم آخر');
    }

    // Assert state machine transition (REJECTED -> DRAFT)
    assertCanTransitionBillingStatus(existing.status, SubcontractorBillingStatus.DRAFT);

    // Reset status to DRAFT and clear rejection & submission details
    const updated = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        status: SubcontractorBillingStatus.DRAFT,
        rejectionReason: null,
        rejectedById: null,
        rejectedAt: null,
        submittedById: null,
        submittedAt: null,
      },
      include: BILLING_INCLUDE,
    });

    // Write SUBCONTRACTOR_BILLING_REOPENED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_REOPENED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          commitmentId: updated.commitmentId,
          grossAmount: updated.grossAmount.toFixed(2),
          previousRejectionReason: existing.rejectionReason,
          reopenedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toSubcontractorBillingSummaryDTO(reopened);
}
