/**
 * lib/commitments/mappers.ts
 *
 * Mappers to convert Prisma Commitment models to client-safe DTOs.
 * Ensures all monetary amounts are strings to prevent IEEE 754 float precision loss.
 * Follows AGENTS.md §13 and §26.
 */

import type {
  BudgetCategory,
  Commitment,
  CommitmentStatus,
  Prisma,
} from '@prisma/client';

import type { CommitmentSummaryDTO } from './types';

export type CommitmentWithRelations = Commitment & {
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
 * Maps a Prisma Commitment record with relations to a client-safe CommitmentSummaryDTO.
 */
export function toCommitmentSummaryDTO(
  c: CommitmentWithRelations,
): CommitmentSummaryDTO {
  return {
    id: c.id,
    projectId: c.projectId,
    project: c.project
      ? {
          id: c.project.id,
          name: c.project.name,
          code: c.project.code,
        }
      : undefined,
    budgetLineId: c.budgetLineId,
    budgetLine: c.budgetLine
      ? {
          id: c.budgetLine.id,
          category: c.budgetLine.category,
          description: c.budgetLine.description,
          amount: c.budgetLine.amount.toFixed(2),
        }
      : undefined,
    referenceNumber: c.referenceNumber ?? null,
    vendorName: c.vendorName,
    amount: c.amount.toFixed(2),
    currency: c.currency,
    description: c.description,
    commitmentDate: c.commitmentDate,
    status: c.status as CommitmentStatus,

    createdById: c.createdById,
    createdBy: {
      id: c.createdBy.id,
      name: c.createdBy.name,
      email: c.createdBy.email,
    },

    submittedById: c.submittedById ?? null,
    submittedBy: c.submittedBy
      ? {
          id: c.submittedBy.id,
          name: c.submittedBy.name,
          email: c.submittedBy.email,
        }
      : null,
    submittedAt: c.submittedAt ?? null,

    approvedById: c.approvedById ?? null,
    approvedBy: c.approvedBy
      ? {
          id: c.approvedBy.id,
          name: c.approvedBy.name,
          email: c.approvedBy.email,
        }
      : null,
    approvedAt: c.approvedAt ?? null,

    rejectedById: c.rejectedById ?? null,
    rejectedBy: c.rejectedBy
      ? {
          id: c.rejectedBy.id,
          name: c.rejectedBy.name,
          email: c.rejectedBy.email,
        }
      : null,
    rejectedAt: c.rejectedAt ?? null,
    rejectionReason: c.rejectionReason ?? null,

    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
