/**
 * lib/expenses/mappers.ts
 *
 * Safe transformations from Prisma Expense models to client-safe DTOs.
 * Ensures Decimal amounts are strictly serialized to formatted 2-decimal strings.
 *
 * Follows AGENTS.md §13 (Monetary rules) and §26 (Client/Server boundary).
 */

import type { Expense, User, BudgetLine, Project } from '@prisma/client';
import type { ExpenseSummaryDTO } from './types';

export type ExpenseWithRelations = Expense & {
  submittedBy: Pick<User, 'id' | 'name' | 'email'>;
  approvedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
  rejectedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
  budgetLine?: Pick<BudgetLine, 'id' | 'category' | 'description' | 'amount'> | null;
  project?: Pick<Project, 'id' | 'name' | 'code'> | null;
};

/**
 * Transforms a Prisma Expense entity into a client-safe ExpenseSummaryDTO.
 */
export function toExpenseSummaryDTO(entity: ExpenseWithRelations): ExpenseSummaryDTO {
  return {
    id: entity.id,
    projectId: entity.projectId,
    project: entity.project
      ? {
          id: entity.project.id,
          name: entity.project.name,
          code: entity.project.code,
        }
      : undefined,
    budgetLineId: entity.budgetLineId,
    budgetLine: entity.budgetLine
      ? {
          id: entity.budgetLine.id,
          category: entity.budgetLine.category,
          description: entity.budgetLine.description,
          amount: entity.budgetLine.amount.toFixed(2),
        }
      : undefined,
    amount: entity.amount.toFixed(2),
    currency: entity.currency,
    description: entity.description,
    expenseDate: entity.expenseDate,
    status: entity.status,

    submittedById: entity.submittedById,
    submittedBy: {
      id: entity.submittedBy.id,
      name: entity.submittedBy.name,
      email: entity.submittedBy.email,
    },
    submittedAt: entity.submittedAt,

    approvedById: entity.approvedById,
    approvedBy: entity.approvedBy
      ? {
          id: entity.approvedBy.id,
          name: entity.approvedBy.name,
          email: entity.approvedBy.email,
        }
      : null,
    approvedAt: entity.approvedAt,

    rejectedById: entity.rejectedById,
    rejectedBy: entity.rejectedBy
      ? {
          id: entity.rejectedBy.id,
          name: entity.rejectedBy.name,
          email: entity.rejectedBy.email,
        }
      : null,
    rejectedAt: entity.rejectedAt,
    rejectionReason: entity.rejectionReason,

    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
