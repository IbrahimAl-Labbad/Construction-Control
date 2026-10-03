/**
 * lib/variation-orders/queries/get-project-variations-summary.ts
 *
 * Computes authoritative financial metrics for a project's variation orders.
 *
 * Calculates:
 *   - Original Approved Budget
 *   - Approved Variations Total
 *   - Revised Approved Budget = Original Budget + Approved Variations Total
 *   - Pending Variations Total
 *   - Projected Budget = Revised Approved Budget + Pending Variations Total
 *   - Breakdown of cost increases vs decreases
 *   - Status counts
 *
 * Follows AGENTS.md §13 and §26.
 */

import { BudgetStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/auth/session';
import { calculateProjectVariationsSummary } from '../calculations';
import { toProjectVariationsSummaryDTO } from '../mappers';
import type { ProjectVariationsSummaryDTO } from '../types';

export async function getProjectVariationsSummary(
  projectId: string,
): Promise<ProjectVariationsSummaryDTO> {
  await requireAuth();

  const zero = new Prisma.Decimal('0.00');

  // Fetch approved budget total for the project
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    select: {
      totalAmount: true,
    },
  });

  const originalBudget = approvedBudget?.totalAmount ?? zero;

  // Fetch all active variations for the project
  const variations = await prisma.variationOrder.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: {
      status: true,
      impactAmount: true,
    },
  });

  const summary = calculateProjectVariationsSummary(originalBudget, variations);
  return toProjectVariationsSummaryDTO(summary);
}
