/**
 * lib/subcontractor-billings/use-cases/cancel-billing.ts
 *
 * Use case: Manager cancels/voids a Subcontractor Billing claim.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Pre-condition guards:
 *    - APPROVED billing cannot be cancelled (throws CANNOT_CANCEL_APPROVED_BILLING).
 *    - Already CANCELLED billing cannot be cancelled again (throws BILLING_ALREADY_CANCELLED).
 * 3. State machine transition: [DRAFT, SUBMITTED] -> CANCELLED.
 * 4. Input validation: optional cancellationReason (5-500 chars).
 * 5. Atomicity: Status update + SUBCONTRACTOR_BILLING_CANCELLED AuditLog in SAME transaction.
 */

import { SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  billingIdSchema,
  cancelBillingSchema,
  type CancelBillingInput,
} from '@/lib/validation/schemas/subcontractor-billing';

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

export async function cancelBilling(
  billingId: unknown,
  input?: CancelBillingInput,
): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate inputs
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  let cancellationReason: string | null = null;
  if (input !== undefined && input !== null) {
    const reasonValidation = validate(cancelBillingSchema, input);
    if (!reasonValidation.success) {
      throw new ValidationError(reasonValidation.errors);
    }
    cancellationReason = reasonValidation.data.cancellationReason ?? null;
  }

  // 3. Execute atomic cancellation transaction
  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    const existing = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        projectId: true,
        commitmentId: true,
        grossAmount: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // Guard: APPROVED records are strictly immutable and cannot be cancelled
    if (existing.status === SubcontractorBillingStatus.APPROVED) {
      throw new AppError(
        'CANNOT_CANCEL_APPROVED_BILLING',
        'لا يمكن إلغاء مستخلص معتمد؛ المستخلصات المعتمدة غير قابلة للإلغاء',
      );
    }

    // Guard: Already cancelled
    if (existing.status === SubcontractorBillingStatus.CANCELLED) {
      throw new AppError('BILLING_ALREADY_CANCELLED', 'المستخلص ملغى بالفعل');
    }

    // Assert state machine transition (DRAFT -> CANCELLED or SUBMITTED -> CANCELLED)
    assertCanTransitionBillingStatus(existing.status, SubcontractorBillingStatus.CANCELLED);

    // Update status to CANCELLED
    const updated = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        status: SubcontractorBillingStatus.CANCELLED,
      },
      include: BILLING_INCLUDE,
    });

    // Write SUBCONTRACTOR_BILLING_CANCELLED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_CANCELLED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          commitmentId: updated.commitmentId,
          grossAmount: updated.grossAmount.toFixed(2),
          previousStatus: existing.status,
          cancellationReason,
          cancelledAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toSubcontractorBillingSummaryDTO(cancelled);
}
