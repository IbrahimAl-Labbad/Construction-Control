/**
 * lib/subcontractor-billings/queries/get-project-billings.ts
 *
 * Query: Returns project-level subcontractor billing overview grouped by Commitment.
 *
 * Enforces:
 * 1. Authorization: policies.canViewBillings(actor) (MANAGER, ENGINEER, ACCOUNTANT).
 *    Purchasing is rejected (throw FORBIDDEN).
 * 2. Loads project, approved budget, and all non-deleted billings with relations.
 * 3. Groups billings by Commitment.
 * 4. For each Commitment calculates:
 *    - Contract Value
 *    - Cumulative Certified = SUM(APPROVED billing.grossAmount)
 *    - Remaining Commitment Balance = Commitment.amount - Cumulative Certified
 *    - Approved billing count
 *    - Billing list (client-safe DTOs)
 * 5. Overall project summary:
 *    - totalApprovedBillingsCertified (display-only)
 *    - pendingBillingsCount (SUBMITTED count)
 * 6. Financial Invariant (AGENTS.md §13 + Slice 7 design gate):
 *    - Only APPROVED billings contribute to cumulative certification totals.
 *    - DRAFT, SUBMITTED, REJECTED, CANCELLED records do NOT contribute.
 *    - Soft-deleted records are strictly excluded.
 *    - cumulativeCertified and remainingBalance are DISPLAY-ONLY values.
 *      They MUST NOT modify BudgetLine exposure or feed calculateBudgetLineExposure().
 *    - All arithmetic uses exact Prisma.Decimal; all returned monetary values are strings.
 */

import { BudgetStatus, Prisma, SubcontractorBillingStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { calculateCumulativeCertified } from '../calculations';
import { toSubcontractorBillingSummaryDTO, type SubcontractorBillingWithRelations } from '../mappers';
import type { CommitmentBillingSummaryDTO, ProjectBillingsOverviewDTO } from '../types';

const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function getProjectBillings(
  projectId: string,
): Promise<ProjectBillingsOverviewDTO> {
  // 1. Authentication + role-based view authorization
  const actor = await requireAuth();
  if (!policies.canViewBillings(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض مستخلصات المشروع');
  }

  // 2. Validate projectId input
  if (!projectId || typeof projectId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'معرّف المشروع غير صالح');
  }

  // 3. Load project
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 4. Load approved active budget (if any)
  await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    select: { id: true },
  });

  // 5. Load all non-deleted subcontractor billings for the project
  const billings = await prisma.subcontractorBilling.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    include: BILLING_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  // 6. Calculate project-level aggregates using exact Decimal arithmetic
  const zero = new Prisma.Decimal('0.00');

  const approvedBillings = billings.filter(
    (b) => b.status === SubcontractorBillingStatus.APPROVED,
  );

  const totalApprovedBillingsCertified = approvedBillings.reduce(
    (acc, b) => acc.add(b.grossAmount),
    zero,
  );

  const pendingBillingsCount = billings.filter(
    (b) => b.status === SubcontractorBillingStatus.SUBMITTED,
  ).length;

  // 7. Group billings by Commitment
  const billingsByCommitment = new Map<
    string,
    {
      commitment: {
        id: string;
        vendorName: string;
        amount: Prisma.Decimal;
        referenceNumber: string | null;
      };
      billings: SubcontractorBillingWithRelations[];
    }
  >();

  for (const billing of billings) {
    if (!billing.commitment) continue;

    const entry = billingsByCommitment.get(billing.commitmentId);
    if (entry) {
      entry.billings.push(billing);
    } else {
      billingsByCommitment.set(billing.commitmentId, {
        commitment: billing.commitment,
        billings: [billing],
      });
    }
  }

  // 8. Build per-commitment billing summaries
  const commitmentBillings: CommitmentBillingSummaryDTO[] = [];

  for (const [commitmentId, group] of billingsByCommitment.entries()) {
    const commitmentApprovedBillings = group.billings.filter(
      (b) => b.status === SubcontractorBillingStatus.APPROVED,
    );
    const approvedBillingCount = commitmentApprovedBillings.length;

    const { cumulativeCertified, remainingCommitmentBalance } =
      calculateCumulativeCertified(group.commitment.amount, commitmentApprovedBillings);

    commitmentBillings.push({
      commitmentId,
      commitmentVendorName: group.commitment.vendorName,
      commitmentReferenceNumber: group.commitment.referenceNumber ?? null,
      contractValue: group.commitment.amount.toFixed(2),
      cumulativeCertified: cumulativeCertified.toFixed(2),
      remainingCommitmentBalance: remainingCommitmentBalance.toFixed(2),
      approvedBillingCount,
      billings: group.billings.map(toSubcontractorBillingSummaryDTO),
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    totalApprovedBillingsCertified: totalApprovedBillingsCertified.toFixed(2),
    pendingBillingsCount,
    commitmentBillings,
    billings: billings.map(toSubcontractorBillingSummaryDTO),
  };
}
