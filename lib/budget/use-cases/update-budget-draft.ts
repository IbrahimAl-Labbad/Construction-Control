/**
 * lib/budget/use-cases/update-budget-draft.ts
 *
 * Use case: Manager updates an existing Version 1 Project Budget draft.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: budgetIdSchema and updateBudgetDraftSchema.
 * 3. Immutability: APPROVED budgets can NEVER be updated.
 * 4. State check: updates allowed ONLY while status is DRAFT.
 * 5. Server-derived totalAmount using Decimal arithmetic.
 * 6. Atomicity: Line replacement + Budget total update + BUDGET_UPDATED AuditLog in SAME transaction.
 *
 * Follows AGENTS.md §8, §13, and §21.
 */

import { BudgetStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  budgetIdSchema,
  updateBudgetDraftSchema,
} from '@/lib/validation/schemas/budget';

import { toBudgetDetailsDTO } from '../mappers';
import type { BudgetDetailsDTO } from '../types';

/**
 * Updates an existing draft budget.
 *
 * @param budgetId - CUID of the target budget
 * @param rawInput - Raw payload { notes?, lines: [{ category, description, amount }] }
 * @returns Updated budget as BudgetDetailsDTO
 */
export async function updateBudgetDraft(
  budgetId: unknown,
  rawInput: unknown,
): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate budgetId
  const idValidation = validate(budgetIdSchema, budgetId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate input
  const inputValidation = validate(updateBudgetDraftSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { notes, lines } = inputValidation.data;

  // 4. Fetch existing budget
  const existing = await prisma.budget.findFirst({
    where: { id, deletedAt: null },
    include: { lines: true },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'الموازنة غير موجودة');
  }

  // 5. Strict immutability & state enforcement
  if (existing.status === BudgetStatus.APPROVED) {
    throw new AppError('IMMUTABLE_RECORD', 'لا يمكن تعديل الموازنة المعتمدة');
  }

  if (existing.status !== BudgetStatus.DRAFT) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      'لا يمكن تعديل الموازنة إلا وهي في حالة مسودة (DRAFT)',
    );
  }

  // 6. Server-side Decimal calculation of new totalAmount
  const newTotalAmount = lines.reduce(
    (acc, line) => acc.add(new Prisma.Decimal(line.amount)),
    new Prisma.Decimal('0.00'),
  );

  const previousTotal = existing.totalAmount.toFixed(2);

  // 7. Atomic transaction: replace lines + update budget + audit log
  const updated = await prisma.$transaction(async (tx) => {
    // Delete existing lines (BudgetLine has no deletedAt in v1 simplification)
    await tx.budgetLine.deleteMany({
      where: { budgetId: id },
    });

    // Create new lines and update budget
    const budget = await tx.budget.update({
      where: { id },
      data: {
        totalAmount: newTotalAmount,
        notes: notes !== undefined ? notes : existing.notes,
        lines: {
          create: lines.map((line) => ({
            category: line.category,
            description: line.description,
            amount: new Prisma.Decimal(line.amount),
          })),
        },
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
        action: 'BUDGET_UPDATED',
        entityType: 'BUDGET',
        entityId: budget.id,
        metadata: {
          projectId: budget.projectId,
          version: budget.version,
          previousTotal,
          newTotal: budget.totalAmount.toFixed(2),
          lineCount: budget.lines.length,
        },
      },
    });

    return budget;
  });

  return toBudgetDetailsDTO(updated);
}
