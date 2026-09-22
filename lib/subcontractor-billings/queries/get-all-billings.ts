/**
 * lib/subcontractor-billings/queries/get-all-billings.ts
 *
 * Query: Returns all non-deleted SubcontractorBilling records across all projects,
 * with computed per-commitment remaining balance map (display-only).
 *
 * Authorization: MANAGER, ACCOUNTANT, ENGINEER only (canViewBillings).
 * PURCHASING is blocked.
 */

import { Prisma, SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { toSubcontractorBillingSummaryDTO } from '../mappers';
import type { SubcontractorBillingSummaryDTO } from '../types';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type AllBillingsResult = {
  billings: SubcontractorBillingSummaryDTO[];
  /**
   * Per-commitment remaining balance (Commitment.amount − SUM(APPROVED billings)).
   * Display-only — must NOT enter BudgetLine exposure calculations.
   */
  remainingBalances: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function getAllBillings(): Promise<AllBillingsResult> {
  const actor = await requireAuth();
  if (!policies.canViewBillings(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض المستخلصات');
  }

  const raw = await prisma.subcontractorBilling.findMany({
    where: { deletedAt: null },
    include: BILLING_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const billings = raw.map(toSubcontractorBillingSummaryDTO);

  // Build per-commitment remaining balance map (display-only)
  const commitmentMap = new Map<
    string,
    { amount: Prisma.Decimal; approvedSum: Prisma.Decimal }
  >();

  for (const b of raw) {
    if (!b.commitment) continue;
    let entry = commitmentMap.get(b.commitmentId);
    if (!entry) {
      entry = {
        amount: b.commitment.amount,
        approvedSum: new Prisma.Decimal('0.00'),
      };
      commitmentMap.set(b.commitmentId, entry);
    }
    if (b.status === SubcontractorBillingStatus.APPROVED && b.deletedAt === null) {
      entry.approvedSum = entry.approvedSum.add(b.grossAmount);
    }
  }

  const remainingBalances: Record<string, string> = {};
  for (const [commitmentId, data] of commitmentMap.entries()) {
    remainingBalances[commitmentId] = data.amount.sub(data.approvedSum).toFixed(2);
  }

  return { billings, remainingBalances };
}
