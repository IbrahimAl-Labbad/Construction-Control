/**
 * lib/variation-orders/queries/list-variation-orders.ts
 *
 * Lists Variation Orders with optional filtering by project and status.
 * Returns paginated client-safe VariationOrderSummaryDTO items.
 *
 * Follows AGENTS.md §12, §18, §26.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/auth/session';
import { toVariationOrderSummaryDTO, type VariationOrderQueryRow } from '../mappers';
import type { ListVariationOrdersFilters, VariationOrderSummaryDTO } from '../types';

export type ListVariationOrdersResult = {
  items: VariationOrderSummaryDTO[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export async function listVariationOrders(
  filters: ListVariationOrdersFilters = {},
): Promise<ListVariationOrdersResult> {
  await requireAuth();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.VariationOrderWhereInput = {
    deletedAt: null,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.budgetLineId ? { budgetLineId: filters.budgetLineId } : {}),
    ...(filters.commitmentId ? { commitmentId: filters.commitmentId } : {}),
  };

  const [totalItems, rows] = await Promise.all([
    prisma.variationOrder.count({ where }),
    prisma.variationOrder.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ requestedDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        budgetLine: {
          select: {
            id: true,
            category: true,
            description: true,
          },
        },
        commitment: {
          select: {
            id: true,
            vendorName: true,
            referenceNumber: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            lines: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const items = rows.map((row) => toVariationOrderSummaryDTO(row as unknown as VariationOrderQueryRow));

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
