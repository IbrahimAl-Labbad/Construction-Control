/**
 * lib/subcontractor-billings/use-cases/get-billing.ts
 *
 * Use case: Fetches a single Subcontractor Billing by ID.
 *
 * Enforces:
 * 1. Authentication & active status check.
 * 2. Authorization: policies.canViewBillings(actor) (MANAGER, ENGINEER, ACCOUNTANT).
 * 3. ID validation via billingIdSchema.
 * 4. Returns client-safe SubcontractorBillingSummaryDTO.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { billingIdSchema } from '@/lib/validation/schemas/subcontractor-billing';

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

export async function getBilling(billingId: unknown): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authentication + coarse role authorization
  const actor = await requireAuth();
  if (!policies.canViewBillings(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض المستخلص');
  }

  // 2. Validate billingId
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch single billing with full relations
  const billing = await prisma.subcontractorBilling.findFirst({
    where: { id, deletedAt: null },
    include: BILLING_INCLUDE,
  });

  if (!billing) {
    throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
  }

  return toSubcontractorBillingSummaryDTO(billing);
}
