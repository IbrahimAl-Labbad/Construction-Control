/**
 * lib/budget/queries/has-approved-budget.ts
 *
 * Minimal read-only cross-domain query.
 * Checks whether a given project has an active APPROVED budget.
 *
 * Rules (Constraint 3):
 * - Performs read-only DB access
 * - Returns only a boolean
 * - Contains no mutation
 * - Contains no UI or Server Action logic
 * - Does not depend on Project use cases
 */

import { BudgetStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Checks whether a project has an approved active budget.
 *
 * @param projectId - CUID of the project
 * @returns true if an approved, non-deleted budget exists; false otherwise
 */
export async function hasApprovedBudget(projectId: string): Promise<boolean> {
  const count = await prisma.budget.count({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
  });

  return count > 0;
}
