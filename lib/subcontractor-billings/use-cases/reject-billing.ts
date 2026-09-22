/**
 * lib/subcontractor-billings/use-cases/reject-billing.ts
 *
 * Use case: Manager rejects a submitted Subcontractor Billing claim with an explicit reason.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Separation of duties:
 *    - actor.id !== billing.createdById (creator cannot reject their own submission)
 *    - actor.id !== billing.submittedById (submitter cannot reject their own submission)
 * 3. Input validation: rejectionReason required (3-500 chars).
 * 4. State machine transition: SUBMITTED -> REJECTED.
 * 5. Atomicity: Status update + rejection details + SUBCONTRACTOR_BILLING_REJECTED AuditLog
 *    in SAME transaction.
 */

import { SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  billingIdSchema,
  rejectBillingSchema,
  type RejectBillingInput,
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

export async function rejectBilling(
  billingId: unknown,
  input: RejectBillingInput,
): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate inputs
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const bodyValidation = validate(rejectBillingSchema, input);
  if (!bodyValidation.success) {
    throw new ValidationError(bodyValidation.errors);
  }
  const data = bodyValidation.data;

  // 3. Execute atomic rejection transaction
  const now = new Date();
  const rejected = await prisma.$transaction(async (tx) => {
    const existing = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdById: true,
        submittedById: true,
        projectId: true,
        commitmentId: true,
        grossAmount: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // Assert separation of duties
    if (existing.createdById === actor.id || existing.submittedById === actor.id) {
      throw new AppError(
        'FORBIDDEN_SELF_APPROVAL',
        'لا يمكن للمعتمد رفض مستخلص مالي قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
      );
    }

    // Assert state machine transition (SUBMITTED -> REJECTED)
    assertCanTransitionBillingStatus(existing.status, SubcontractorBillingStatus.REJECTED);

    // Update status to REJECTED
    const updated = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        status: SubcontractorBillingStatus.REJECTED,
        rejectedById: actor.id,
        rejectedAt: now,
        rejectionReason: data.rejectionReason,
      },
      include: BILLING_INCLUDE,
    });

    // Write SUBCONTRACTOR_BILLING_REJECTED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_REJECTED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          commitmentId: updated.commitmentId,
          grossAmount: updated.grossAmount.toFixed(2),
          rejectionReason: data.rejectionReason,
          rejectedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toSubcontractorBillingSummaryDTO(rejected);
}
