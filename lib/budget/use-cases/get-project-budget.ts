/**
 * lib/budget/use-cases/get-project-budget.ts
 *
 * Use case: Retrieve the current budget for a project with all lines.
 *
 * Enforces:
 * 1. Authorization: Any authenticated, active user.
 * 2. Validation: projectId validation.
 * 3. Client-safe DTO formatting with Decimal serialized as string.
 */

import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project';

import { toBudgetDetailsDTO } from '../mappers';
import type { BudgetDetailsDTO } from '../types';

/**
 * Retrieves the budget and lines for a given project.
 *
 * @param projectId - CUID of the project
 * @returns BudgetDetailsDTO or null if no budget has been created yet
 */
export async function getProjectBudget(projectId: unknown): Promise<BudgetDetailsDTO | null> {
  // 1. Authorization — authenticated active user
  await requireAuth();

  // 2. Validate projectId
  const idValidation = validate(projectIdSchema, projectId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Query the latest budget record for this project
  const budget = await prisma.budget.findFirst({
    where: { projectId: id, deletedAt: null },
    orderBy: { version: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      lines: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!budget) {
    return null;
  }

  return toBudgetDetailsDTO(budget);
}
