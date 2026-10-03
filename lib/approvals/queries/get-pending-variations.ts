/**
 * lib/approvals/queries/get-pending-variations.ts
 *
 * Fetches paginated pending variation order approvals.
 * Lean projection: selects only fields required by VariationOrderApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toVariationOrderApprovalItemDTO } from '../mappers';
import type { VariationOrderApprovalItemDTO } from '../types';

export const PENDING_VARIATIONS_SELECT = {
  id: true,
  orderNumber: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  impactAmount: true,
  currency: true,
  title: true,
  reason: true,
  scopeImpact: true,
  status: true,
  createdBy: { select: { name: true } },
  commitment: { select: { referenceNumber: true, vendorName: true } },
  _count: { select: { lines: true } },
  submittedAt: true,
  createdAt: true,
} as const;

export async function getPendingVariations(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: VariationOrderApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.variationOrder.findMany({
      where,
      select: PENDING_VARIATIONS_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.variationOrder.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toVariationOrderApprovalItemDTO({
      id: item.id,
      orderNumber: item.orderNumber,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      impactAmount: item.impactAmount,
      currency: item.currency,
      title: item.title,
      reason: item.reason,
      scopeImpact: item.scopeImpact,
      status: item.status,
      createdBy: item.createdBy,
      commitment: item.commitment,
      _count: item._count,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
    }),
  );

  return { items, totalItems };
}
