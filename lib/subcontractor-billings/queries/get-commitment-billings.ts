/**
 * lib/subcontractor-billings/queries/get-commitment-billings.ts
 *
 * Query: Returns the complete billing summary and claim history for a single Commitment.
 *
 * Enforces:
 * 1. Authorization: policies.canViewBillings(actor) (MANAGER, ENGINEER, ACCOUNTANT).
 *    Purchasing is rejected (throw FORBIDDEN).
 * 2. Loads the Commitment and all non-deleted billings linked to it.
 * 3. Calculates:
 *    - cumulativeCertified = SUM(APPROVED billing.grossAmount)
 *    - remainingBalance = Commitment.amount - cumulativeCertified
 *    - approvedBillingCount = COUNT(APPROVED non-deleted billings)
 * 4. Financial Invariant (AGENTS.md §13 + Slice 7 design gate):
 *    - Only APPROVED billings contribute to cumulative certification totals.
 *    - DRAFT, SUBMITTED, REJECTED, CANCELLED records do NOT contribute.
 *    - Soft-deleted records are strictly excluded.
 *    - All arithmetic uses exact Prisma.Decimal; all returned monetary values are strings.
 * 5. Returns client-safe CommitmentBillingSummaryDTO.
 */

import { SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { calculateCumulativeCertified } from '../calculations';
import { toSubcontractorBillingSummaryDTO } from '../mappers';
import type { CommitmentBillingSummaryDTO } from '../types';

const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function getCommitmentBillings(
  commitmentId: string,
): Promise<CommitmentBillingSummaryDTO> {
  // 1. Authentication + role-based view authorization
  const actor = await requireAuth();
  if (!policies.canViewBillings(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض مستخلصات الالتزام');
  }

  // 2. Validate commitmentId input
  if (!commitmentId || typeof commitmentId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'معرّف الالتزام غير صالح');
  }

  // 3. Load Commitment
  const commitment = await prisma.commitment.findFirst({
    where: { id: commitmentId, deletedAt: null },
    select: {
      id: true,
      vendorName: true,
      amount: true,
      referenceNumber: true,
    },
  });

  if (!commitment) {
    throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
  }

  // 4. Load all non-deleted billings linked to this Commitment
  const billings = await prisma.subcontractorBilling.findMany({
    where: {
      commitmentId,
      deletedAt: null,
    },
    include: BILLING_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  // 5. Filter for APPROVED billings only to compute cumulative certification
  const approvedBillings = billings.filter(
    (b) => b.status === SubcontractorBillingStatus.APPROVED,
  );
  const approvedBillingCount = approvedBillings.length;

  const { cumulativeCertified, remainingCommitmentBalance } =
    calculateCumulativeCertified(commitment.amount, approvedBillings);

  // 6. Return client-safe DTO
  return {
    commitmentId: commitment.id,
    commitmentVendorName: commitment.vendorName,
    commitmentReferenceNumber: commitment.referenceNumber ?? null,
    contractValue: commitment.amount.toFixed(2),
    cumulativeCertified: cumulativeCertified.toFixed(2),
    remainingCommitmentBalance: remainingCommitmentBalance.toFixed(2),
    approvedBillingCount,
    billings: billings.map(toSubcontractorBillingSummaryDTO),
  };
}
