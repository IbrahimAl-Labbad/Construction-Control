/**
 * lib/subcontractor-billings/mappers.ts
 *
 * Maps Prisma SubcontractorBilling records (with relations) to client-safe DTOs.
 * Ensures all monetary amounts are converted to strings (toFixed(2))
 * to prevent IEEE 754 float precision loss at the client boundary.
 *
 * Follows AGENTS.md §13 and §26.
 */

import type {
  BudgetCategory,
  Prisma,
  SubcontractorBilling,
  SubcontractorBillingStatus,
} from '@prisma/client';

import type { SubcontractorBillingSummaryDTO } from './types';

export type SubcontractorBillingWithRelations = SubcontractorBilling & {
  project?: {
    id: string;
    name: string;
    code: string;
  } | null;
  budgetLine?: {
    id: string;
    category: BudgetCategory;
    description: string;
    amount: Prisma.Decimal;
  } | null;
  commitment?: {
    id: string;
    vendorName: string;
    amount: Prisma.Decimal;
    referenceNumber: string | null;
  } | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  submittedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  rejectedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

/**
 * Maps a Prisma SubcontractorBilling record with relations to a client-safe DTO.
 */
export function toSubcontractorBillingSummaryDTO(
  b: SubcontractorBillingWithRelations,
): SubcontractorBillingSummaryDTO {
  return {
    id: b.id,

    projectId: b.projectId,
    project: b.project
      ? { id: b.project.id, name: b.project.name, code: b.project.code }
      : undefined,

    budgetLineId: b.budgetLineId,
    budgetLine: b.budgetLine
      ? {
          id: b.budgetLine.id,
          category: b.budgetLine.category,
          description: b.budgetLine.description,
          amount: b.budgetLine.amount.toFixed(2),
        }
      : undefined,

    commitmentId: b.commitmentId,
    commitment: b.commitment
      ? {
          id: b.commitment.id,
          vendorName: b.commitment.vendorName,
          amount: b.commitment.amount.toFixed(2),
          referenceNumber: b.commitment.referenceNumber ?? null,
        }
      : undefined,

    subcontractorName: b.subcontractorName,
    referenceNumber: b.referenceNumber ?? null,
    billingPeriod: b.billingPeriod,
    claimDate: b.claimDate,

    grossAmount: b.grossAmount.toFixed(2),
    currency: b.currency,
    description: b.description,
    status: b.status as SubcontractorBillingStatus,

    createdById: b.createdById,
    createdBy: {
      id: b.createdBy.id,
      name: b.createdBy.name,
      email: b.createdBy.email,
    },

    submittedById: b.submittedById ?? null,
    submittedBy: b.submittedBy
      ? { id: b.submittedBy.id, name: b.submittedBy.name, email: b.submittedBy.email }
      : null,
    submittedAt: b.submittedAt ?? null,

    approvedById: b.approvedById ?? null,
    approvedBy: b.approvedBy
      ? { id: b.approvedBy.id, name: b.approvedBy.name, email: b.approvedBy.email }
      : null,
    approvedAt: b.approvedAt ?? null,

    rejectedById: b.rejectedById ?? null,
    rejectedBy: b.rejectedBy
      ? { id: b.rejectedBy.id, name: b.rejectedBy.name, email: b.rejectedBy.email }
      : null,
    rejectedAt: b.rejectedAt ?? null,
    rejectionReason: b.rejectionReason ?? null,

    deletedAt: b.deletedAt ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}
