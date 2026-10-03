/**
 * lib/variation-orders/mappers.ts
 *
 * Pure transformation functions mapping Prisma query results to client-safe DTOs
 * for the Variation Order domain (Slice 20).
 *
 * Ensures all monetary amounts and quantities are formatted exact 2-decimal strings,
 * and all dates are ISO formatted strings to cross the server/client boundary safely.
 * Follows AGENTS.md §13 and §26.
 */

import type { VariationOrderStatus } from '@prisma/client';
import type { ProjectVariationsSummaryResult } from './calculations';
import type {
  VariationOrderLineDTO,
  VariationOrderSummaryDTO,
  VariationOrderDetailDTO,
  ProjectVariationsSummaryDTO,
} from './types';

// Helper for exact decimal string formatting
function formatAmount(amount: { toFixed: (digits: number) => string } | string | number): string {
  if (typeof amount === 'string') {
    return Number(amount).toFixed(2);
  }
  if (typeof amount === 'number') {
    return amount.toFixed(2);
  }
  return amount.toFixed(2);
}

// Helpers for ISO timestamp string formatting
function formatIsoTimestamp(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

function formatRequiredIsoTimestamp(date: Date | string | null | undefined): string {
  if (!date) return new Date().toISOString();
  if (typeof date === 'string') return date;
  return date.toISOString();
}

export type VariationOrderLineRow = {
  id: string;
  description: string;
  unit: string;
  originalQuantity: { toFixed: (digits: number) => string } | string;
  revisedQuantity: { toFixed: (digits: number) => string } | string;
  quantityDelta: { toFixed: (digits: number) => string } | string;
  originalRate: { toFixed: (digits: number) => string } | string;
  revisedRate: { toFixed: (digits: number) => string } | string;
  financialDelta: { toFixed: (digits: number) => string } | string;
  notes: string | null;
};

export function toVariationOrderLineDTO(row: VariationOrderLineRow): VariationOrderLineDTO {
  return {
    id: row.id,
    description: row.description,
    unit: row.unit,
    originalQuantity: formatAmount(row.originalQuantity),
    revisedQuantity: formatAmount(row.revisedQuantity),
    quantityDelta: formatAmount(row.quantityDelta),
    originalRate: formatAmount(row.originalRate),
    revisedRate: formatAmount(row.revisedRate),
    financialDelta: formatAmount(row.financialDelta),
    notes: row.notes,
  };
}

export type VariationOrderQueryRow = {
  id: string;
  orderNumber: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLineId: string | null;
  budgetLine?: { category: string; description: string } | null;
  commitmentId: string | null;
  commitment?: { vendorName: string; referenceNumber: string | null } | null;
  title: string;
  description: string;
  reason: string;
  scopeImpact: string | null;
  status: VariationOrderStatus;
  impactAmount: { toFixed: (digits: number) => string } | string;
  currency: string;
  createdById: string;
  createdBy: { name: string };
  submittedById: string | null;
  submittedBy?: { name: string } | null;
  submittedAt: Date | string | null;
  approvedById: string | null;
  approvedBy?: { name: string } | null;
  approvedAt: Date | string | null;
  rejectedById: string | null;
  rejectedBy?: { name: string } | null;
  rejectedAt: Date | string | null;
  rejectionReason: string | null;
  lines?: VariationOrderLineRow[];
  _count?: { lines: number };
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function toVariationOrderSummaryDTO(row: VariationOrderQueryRow): VariationOrderSummaryDTO {
  const linesCount = row._count?.lines ?? row.lines?.length ?? 0;

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    title: row.title,
    description: row.description,
    reason: row.reason,
    scopeImpact: row.scopeImpact,
    status: row.status,
    impactAmount: formatAmount(row.impactAmount),
    currency: 'SAR',
    budgetLineId: row.budgetLineId,
    budgetLineCategory: row.budgetLine?.category ?? null,
    budgetLineDescription: row.budgetLine?.description ?? null,
    commitmentId: row.commitmentId,
    commitmentVendorName: row.commitment?.vendorName ?? null,
    commitmentReference: row.commitment?.referenceNumber ?? null,
    createdById: row.createdById,
    createdByName: row.createdBy.name,
    submittedById: row.submittedById,
    submittedByName: row.submittedBy?.name ?? null,
    submittedAt: formatIsoTimestamp(row.submittedAt),
    approvedById: row.approvedById,
    approvedByName: row.approvedBy?.name ?? null,
    approvedAt: formatIsoTimestamp(row.approvedAt),
    rejectedById: row.rejectedById,
    rejectedByName: row.rejectedBy?.name ?? null,
    rejectedAt: formatIsoTimestamp(row.rejectedAt),
    rejectionReason: row.rejectionReason,
    linesCount,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    updatedAt: formatRequiredIsoTimestamp(row.updatedAt),
  };
}

export function toVariationOrderDetailDTO(row: VariationOrderQueryRow): VariationOrderDetailDTO {
  const summary = toVariationOrderSummaryDTO(row);
  const lines = (row.lines ?? []).map(toVariationOrderLineDTO);

  return {
    ...summary,
    lines,
  };
}

export function toProjectVariationsSummaryDTO(
  result: ProjectVariationsSummaryResult,
): ProjectVariationsSummaryDTO {
  return {
    originalBudget: formatAmount(result.originalBudget),
    approvedVariationsTotal: formatAmount(result.approvedVariationsTotal),
    revisedApprovedBudget: formatAmount(result.revisedApprovedBudget),
    pendingVariationsTotal: formatAmount(result.pendingVariationsTotal),
    projectedBudget: formatAmount(result.projectedBudget),
    totalApprovedIncreases: formatAmount(result.totalApprovedIncreases),
    totalApprovedDecreases: formatAmount(result.totalApprovedDecreases),
    counts: result.counts,
  };
}
