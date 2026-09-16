/**
 * lib/budget/use-cases/create-budget-draft.ts
 *
 * Use case: Manager creates a new Version 1 Project Budget draft.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: createBudgetDraftSchema (Zod).
 * 3. Project validity: must exist, not soft-deleted, and status not COMPLETED/CANCELLED.
 * 4. Workflow rule: exactly one Version 1 budget workflow per project.
 * 5. Server-derived totalAmount using Decimal arithmetic.
 * 6. Atomicity: Budget + BudgetLines + BUDGET_CREATED AuditLog in SAME transaction.
 *
 * Follows AGENTS.md §8 (use cases), §13 (financial rules), and §21 (audit).
 */

import { BudgetStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { createBudgetDraftSchema } from '@/lib/validation/schemas/budget';

import { toBudgetDetailsDTO } from '../mappers';
import type { BudgetDetailsDTO } from '../types';

/**
 * Creates a new Version 1 draft budget for a project.
 *
 * @param rawInput - Raw payload { projectId, notes?, lines: [{ category, description, amount }] }
 * @returns Created budget as BudgetDetailsDTO
 */
export async function createBudgetDraft(rawInput: unknown): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(createBudgetDraftSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const { projectId, notes, lines } = validation.data;

  // 3. Verify target project exists and is eligible
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  if (
    project.status === ProjectStatus.COMPLETED ||
    project.status === ProjectStatus.CANCELLED
  ) {
    throw new AppError(
      'INVALID_PROJECT_STATUS',
      'لا يمكن إنشاء موازنة لمشروع مكتمل أو ملغي',
    );
  }

  // 4. Verify existing budget state for project
  const existingBudget = await prisma.budget.findFirst({
    where: { projectId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (existingBudget) {
    if (existingBudget.status === BudgetStatus.APPROVED) {
      throw new AppError(
        'ALREADY_EXISTS',
        'يوجد بالفعل موازنة معتمدة للمشروع، ولا يمكن إنشاء موازنة جديدة',
      );
    }
    throw new AppError(
      'ALREADY_EXISTS',
      'توجد بالفعل موازنة للمشروع قيد المتابعة، يرجى متابعة المسودة الحالية',
    );
  }

  // 5. Server-side Decimal calculation of totalAmount
  const totalAmount = lines.reduce(
    (acc, line) => acc.add(new Prisma.Decimal(line.amount)),
    new Prisma.Decimal('0.00'),
  );

  // 6. Atomic transaction: Budget + Lines + AuditLog
  const created = await prisma.$transaction(async (tx) => {
    const budget = await tx.budget.create({
      data: {
        projectId,
        version: 1,
        status: BudgetStatus.DRAFT,
        totalAmount,
        currency: 'SAR',
        notes: notes ?? null,
        createdById: actor.id,
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
        action: 'BUDGET_CREATED',
        entityType: 'BUDGET',
        entityId: budget.id,
        metadata: {
          projectId: budget.projectId,
          version: budget.version,
          status: budget.status,
          totalAmount: budget.totalAmount.toFixed(2),
          currency: budget.currency,
          lineCount: budget.lines.length,
        },
      },
    });

    return budget;
  });

  return toBudgetDetailsDTO(created);
}
