/**
 * lib/budget/use-cases/approve-budget.ts
 *
 * Use case: Manager formally approves a submitted Project Budget.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only (exclusive approval authority).
 * 2. Validation: budgetIdSchema.
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Immutability trigger: Once APPROVED, budget and its lines can never be changed.
 * 5. Atomicity: Status update + approval metadata + BUDGET_APPROVED AuditLog in SAME transaction.
 *
 * Follows AGENTS.md §5.1, §8, and §21.
 */

import { BudgetStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { budgetIdSchema } from '@/lib/validation/schemas/budget';

import { toBudgetDetailsDTO } from '../mappers';
import { assertCanTransitionBudgetStatus } from '../state-machine';
import type { BudgetDetailsDTO } from '../types';

/**
 * Approves a submitted budget, locking it as the active baseline.
 *
 * @param budgetId - CUID of the target budget
 * @returns Approved budget as BudgetDetailsDTO
 */
export async function approveBudget(budgetId: unknown): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate budgetId
  const idValidation = validate(budgetIdSchema, budgetId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch existing budget
  const existing = await prisma.budget.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: true,
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'الموازنة غير موجودة');
  }

  // 4. Assert state machine transition (SUBMITTED -> APPROVED)
  assertCanTransitionBudgetStatus(existing.status, BudgetStatus.APPROVED);

  // 5. Atomic transaction: update status, record approver, write audit log
  const now = new Date();
  let approved;
  try {
    approved = await prisma.$transaction(async (tx) => {
      const budget = await tx.budget.update({
        where: { id },
        data: {
          status: BudgetStatus.APPROVED,
          approvedById: actor.id,
          approvedAt: now,
          rejectionReason: null,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          lines: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'BUDGET_APPROVED',
          entityType: 'BUDGET',
          entityId: budget.id,
          metadata: {
            projectId: budget.projectId,
            version: budget.version,
            totalAmount: budget.totalAmount.toFixed(2),
            approvedAt: now.toISOString(),
            lineCount: budget.lines.length,
          },
        },
      });

      return budget;
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('budget.approval_transaction_failed', {
        budgetId: id,
        actorId: actor.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  logger.info('budget.approved', {
    budgetId: approved.id,
    projectId: approved.projectId,
    totalAmount: approved.totalAmount.toFixed(2),
    actorId: actor.id,
  });

  return toBudgetDetailsDTO(approved);
}
