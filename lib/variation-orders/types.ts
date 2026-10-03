/**
 * lib/variation-orders/types.ts
 *
 * DTO and parameter types for the Variation Order / Change Order domain (Slice 20).
 * All types strictly observe the server/client serialization boundary:
 * - No Prisma model types
 * - No Decimal instances (monetary amounts and quantities are exact strings)
 * - No Date instances (timestamps and dates are ISO strings)
 *
 * Follows AGENTS.md §13 and §26.
 */

import type { VariationOrderStatus } from '@prisma/client';

export type VariationOrderLineDTO = {
  id: string;
  description: string;
  unit: string;
  originalQuantity: string;
  revisedQuantity: string;
  quantityDelta: string;
  originalRate: string;
  revisedRate: string;
  financialDelta: string;
  notes: string | null;
};

export type VariationOrderSummaryDTO = {
  id: string;
  orderNumber: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  description: string;
  reason: string;
  scopeImpact: string | null;
  status: VariationOrderStatus;
  /** Exact decimal amount as string, e.g. "15000.00" or "-5000.00" */
  impactAmount: string;
  currency: 'SAR';
  budgetLineId: string | null;
  budgetLineCategory: string | null;
  budgetLineDescription: string | null;
  commitmentId: string | null;
  commitmentVendorName: string | null;
  commitmentReference: string | null;
  createdById: string;
  createdByName: string;
  submittedById: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  linesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type VariationOrderDetailDTO = VariationOrderSummaryDTO & {
  lines: VariationOrderLineDTO[];
};

export type ProjectVariationsSummaryDTO = {
  originalBudget: string;
  approvedVariationsTotal: string;
  revisedApprovedBudget: string;
  pendingVariationsTotal: string;
  projectedBudget: string;
  totalApprovedIncreases: string;
  totalApprovedDecreases: string;
  counts: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    total: number;
  };
};

export type ListVariationOrdersFilters = {
  projectId?: string;
  status?: VariationOrderStatus;
  budgetLineId?: string;
  commitmentId?: string;
  page?: number;
  pageSize?: number;
};
