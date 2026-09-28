/**
 * lib/expenses/use-cases/create-expense-draft.ts
 *
 * Use case: Field staff (Engineer or Accountant) creates a new Expense draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT only.
 * 2. Validation: createExpenseDraftSchema (Zod).
 * 3. Project validity: Target project exists, not deleted, and status is ACTIVE.
 * 4. Budget validity: Project must have an APPROVED non-deleted budget.
 * 5. Budget line validity: budgetLineId must belong to that approved budget.
 * 6. Immutability setup: status defaults to DRAFT, submittedById set to actor.id.
 * 7. Atomicity: Expense + EXPENSE_CREATED AuditLog in SAME transaction.
 *
 * Follows AGENTS.md §8, §13, §21, and Slice 4 specifications.
 */

import { BudgetStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import { createExpenseDraftSchema } from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import type { ExpenseSummaryDTO } from '../types';

/**
 * Creates a new draft expense claim for an active project.
 */
export async function createExpenseDraft(rawInput: unknown): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canManageExpenseDraft(actor)) {
    throw new AppError(
      'FORBIDDEN',
      'فقط المهندسون الميدانيون والمحاسبون يملكون صلاحية إنشاء مسودات المصروفات',
    );
  }

  // 2. Validate input
  const validation = validate(createExpenseDraftSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const { projectId, budgetLineId, custodyId, amount, expenseDate, description } = validation.data;

  // 3. Verify target project exists, not deleted, and is ACTIVE
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, status: true, code: true, name: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  if (project.status !== ProjectStatus.ACTIVE) {
    throw new AppError(
      'INVALID_PROJECT_STATUS',
      'لا يمكن تسجيل مصروفات إلا للمشاريع النشطة فقط (ACTIVE)',
    );
  }

  // 3.1 For Site Engineers: verify active project assignment (Slice 14 / BD-14-02)
  if (actor.role === Role.ENGINEER) {
    const isAssigned = await isEngineerAssignedToProject(projectId, actor.id);
    if (!isAssigned) {
      throw new AppError(
        'FORBIDDEN',
        'لا يمكنك تسجيل مصروفات لمشروع لست معيناً ضمن فريقه الهندسي',
      );
    }
  }

  // 4. Verify project has an APPROVED, non-deleted budget
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!approvedBudget) {
    throw new AppError(
      'BUDGET_NOT_APPROVED',
      'المشروع لا يمتلك موازنة معتمدة نشطة، ولا يمكن تسجيل مصروفات عليه',
    );
  }

  // 5. Verify budget line exists under this approved budget
  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      id: budgetLineId,
      budgetId: approvedBudget.id,
    },
    select: { id: true, category: true, description: true, amount: true },
  });

  if (!budgetLine) {
    throw new AppError(
      'INVALID_BUDGET_LINE',
      'بند الموازنة المحدد غير موجود أو لا ينتمي للموازنة المعتمدة للمشروع',
    );
  }

  // 5.1 If custodyId is specified, verify custody invariants
  if (custodyId) {
    const custody = await prisma.custody.findFirst({
      where: { id: custodyId, deletedAt: null },
      select: { id: true, projectId: true, budgetLineId: true, custodianUserId: true, status: true },
    });

    if (!custody) {
      throw new AppError('NOT_FOUND', 'العهدة المحددة غير موجودة');
    }

    if (custody.status !== 'ISSUED' && custody.status !== 'PARTIALLY_SETTLED') {
      throw new AppError(
        'CUSTODY_NOT_ISSUED',
        `لا يمكن تسجيل مصروف على عهدة بحالة "${custody.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
      );
    }

    if (custody.projectId !== projectId) {
      throw new AppError('INVALID_EXPENSE_LINKAGE', 'مشروع العهدة لا يتطابق مع مشروع المصروف');
    }

    if (custody.budgetLineId !== budgetLineId) {
      throw new AppError('INVALID_EXPENSE_LINKAGE', 'بند موازنة العهدة لا يتطابق مع بند موازنة المصروف');
    }

    if (custody.custodianUserId !== actor.id) {
      throw new AppError('FORBIDDEN', 'فقط أمين العهدة يمكنه تسجيل مصروفات لتسوية هذه العهدة');
    }
  }

  // 6. Monetary conversion
  const decimalAmount = new Prisma.Decimal(amount);

  // 7. Atomic transaction: Expense creation + AuditLog
  const created = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        projectId,
        budgetLineId,
        custodyId: custodyId ?? null,
        amount: decimalAmount,
        currency: 'SAR',
        description,
        expenseDate,
        submittedById: actor.id,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_CREATED',
        entityType: 'EXPENSE',
        entityId: expense.id,
        metadata: {
          projectId: expense.projectId,
          budgetLineId: expense.budgetLineId,
          amount: expense.amount.toFixed(2),
          expenseDate: expense.expenseDate.toISOString(),
          description: expense.description,
        },
      },
    });

    return expense;
  });

  return toExpenseSummaryDTO(created);
}
