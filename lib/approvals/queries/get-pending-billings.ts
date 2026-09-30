/**
 * lib/approvals/queries/get-pending-billings.ts
 *
 * Fetches paginated pending subcontractor billing approvals.
 * Lean projection: selects only fields required by BillingApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toBillingApprovalItemDTO } from '../mappers';
import type { BillingApprovalItemDTO } from '../types';

export const PENDING_BILLINGS_SELECT = {
  id: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  grossAmount: true,
  currency: true,
  subcontractorName: true,
  referenceNumber: true,
  billingPeriod: true,
  claimDate: true,
  status: true,
  createdBy: { select: { name: true } },
  commitment: { select: { referenceNumber: true, amount: true } },
  submittedAt: true,
  createdAt: true,
} as const;

export async function getPendingBillings(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: BillingApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.subcontractorBilling.findMany({
      where,
      select: PENDING_BILLINGS_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.subcontractorBilling.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toBillingApprovalItemDTO({
      id: item.id,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      grossAmount: item.grossAmount,
      currency: item.currency,
      subcontractorName: item.subcontractorName,
      referenceNumber: item.referenceNumber,
      billingPeriod: item.billingPeriod,
      claimDate: item.claimDate,
      status: item.status,
      createdBy: item.createdBy,
      commitment: item.commitment,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
    })
  );

  return { items, totalItems };
}
