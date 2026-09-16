/**
 * lib/budget/mappers.ts
 *
 * Safe transformations from Prisma Budget models to client-safe DTOs.
 * Ensures Decimal amounts are strictly serialized to formatted strings.
 *
 * Follows AGENTS.md §13 (Monetary rules) and §26 (Client/Server boundary).
 */

import type { Budget, BudgetLine, User } from '@prisma/client';
import type { BudgetDetailsDTO, BudgetSummaryDTO } from './types';

type BudgetWithRelations = Budget & {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  approvedBy?: Pick<User, 'id' | 'name' | 'email'> | null | undefined;
  lines?: BudgetLine[] | undefined;
  _count?: {
    lines: number;
  } | undefined;
};

/**
 * Transforms a Prisma Budget entity into a client-safe BudgetSummaryDTO.
 */
export function toBudgetSummaryDTO(entity: BudgetWithRelations): BudgetSummaryDTO {
  return {
    id: entity.id,
    projectId: entity.projectId,
    version: entity.version,
    status: entity.status,
    totalAmount: entity.totalAmount.toFixed(2),
    currency: entity.currency,
    notes: entity.notes,
    createdById: entity.createdById,
    createdBy: {
      id: entity.createdBy.id,
      name: entity.createdBy.name,
      email: entity.createdBy.email,
    },
    approvedById: entity.approvedById,
    approvedBy: entity.approvedBy
      ? {
          id: entity.approvedBy.id,
          name: entity.approvedBy.name,
          email: entity.approvedBy.email,
        }
      : null,
    approvedAt: entity.approvedAt,
    rejectionReason: entity.rejectionReason,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    lineCount: entity._count?.lines ?? entity.lines?.length ?? 0,
  };
}

/**
 * Transforms a Prisma Budget entity with lines into a client-safe BudgetDetailsDTO.
 */
export function toBudgetDetailsDTO(entity: BudgetWithRelations): BudgetDetailsDTO {
  const summary = toBudgetSummaryDTO(entity);
  return {
    ...summary,
    lines: (entity.lines ?? []).map((line) => ({
      id: line.id,
      budgetId: line.budgetId,
      category: line.category,
      description: line.description,
      amount: line.amount.toFixed(2),
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    })),
  };
}
