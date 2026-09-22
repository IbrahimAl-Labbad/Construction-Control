/**
 * lib/subcontractor-billings/use-cases/delete-billing-draft.ts
 *
 * Use case: Accountant hard-deletes a Subcontractor Billing draft.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canManageBillingDraft).
 * 2. Ownership: billing.createdById === actor.id.
 * 3. State: billing must be DRAFT (never submitted — AGENTS.md §14).
 * 4. Performs a HARD delete (AGENTS.md §14 allows hard delete of never-submitted drafts).
 * 5. Atomicity: deletion + SUBCONTRACTOR_BILLING_DELETED AuditLog in SAME transaction.
 */

import { SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { billingIdSchema } from '@/lib/validation/schemas/subcontractor-billing';

export async function deleteBillingDraft(billingId: unknown): Promise<void> {
  // 1. Authentication + coarse role authorization
  const actor = await requireAuth();
  if (!policies.canManageBillingDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بحذف مستخلص مقاول باطن');
  }

  // 2. Validate billingId
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Atomic deletion transaction
  await prisma.$transaction(async (tx) => {
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
        subcontractorName: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
    }

    // 3.2 Ownership check
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك حذف مستخلص أنشأه مستخدم آخر');
    }

    // 3.3 State check: only DRAFT that was never submitted may be hard-deleted
    if (existing.status !== SubcontractorBillingStatus.DRAFT) {
      throw new AppError(
        'RECORD_NOT_EDITABLE',
        `لا يمكن حذف المستخلص وهو في حالة "${existing.status}"، الحذف متاح فقط للمسودات التي لم تُقدَّم بعد`,
      );
    }

    // 3.4 Hard delete
    await tx.subcontractorBilling.delete({ where: { id } });

    // 3.5 Write AuditLog (append-only — delete is irreversible)
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_DELETED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          commitmentId: existing.commitmentId,
          subcontractorName: existing.subcontractorName,
          grossAmount: existing.grossAmount.toFixed(2),
          deletedAt: new Date().toISOString(),
        },
      },
    });
  });
}
