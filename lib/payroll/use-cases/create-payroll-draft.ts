/**
 * lib/payroll/use-cases/create-payroll-draft.ts
 *
 * Use case: Accountant creates a new PayrollEntry draft.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canCreatePayrollDraft).
 * 2. Zod validation via createPayrollDraftSchema.
 * 3. Server-authoritative invariants inside single transaction:
 *    - Project must exist, be ACTIVE, and not deleted.
 *    - Project must have an APPROVED, non-deleted budget.
 *    - BudgetLine must belong to approved budget of project.
 *    - BudgetLine.category must be LABOR (INVALID_BUDGET_LINE_CATEGORY).
 *    - Currency is SAR (enforced via schema & assertion).
 * 4. BD-10 Business key duplicate guard:
 *    - (projectId, periodYear, periodMonth, normalizedWorkerName)
 *    - Transaction-scoped advisory locking via pg_advisory_xact_lock.
 *    - Prohibits duplicates among active statuses: DRAFT, SUBMITTED, APPROVED.
 * 5. Atomicity: Record creation + PAYROLL_ENTRY_CREATED AuditLog in SAME transaction.
 */

import { BudgetCategory, BudgetStatus, PayrollStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  createPayrollDraftSchema,
} from '@/lib/validation/schemas/payroll';

import { buildPayrollDuplicateKey, normalizePayrollWorkerName } from '../calculations';
import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntrySummaryDTO } from '../types';

export async function createPayrollDraft(
  input: unknown,
): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication & coarse role authorization (Accountant only)
  const actor = await requireAuth();
  if (!policies.canCreatePayrollDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء مسودة قيد رواتب (محاسب فقط)');
  }

  // 2. Validate input schema
  const validation = validate(createPayrollDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  // 3. Execute atomic transaction
  const created = await prisma.$transaction(async (tx) => {
    // 3.1 Project must exist, be ACTIVE, and not deleted
    const project = await tx.project.findFirst({
      where: { id: data.projectId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }
    if (project.status !== ProjectStatus.ACTIVE) {
      throw new AppError(
        'INVALID_PROJECT_STATUS',
        `لا يمكن إنشاء قيد راتب لمشروع غير نشط (حالة المشروع: ${project.status})`,
      );
    }

    // 3.2 Approved budget must exist for the project
    const approvedBudget = await tx.budget.findFirst({
      where: { projectId: data.projectId, status: BudgetStatus.APPROVED, deletedAt: null },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 3.3 BudgetLine must belong to the approved budget
    const budgetLine = await tx.budgetLine.findFirst({
      where: { id: data.budgetLineId, budgetId: approvedBudget.id },
      select: { id: true, category: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة غير موجود أو لا يتبع للموازنة المعتمدة للمشروع',
      );
    }

    // 3.4 BudgetLine category must be LABOR
    if (budgetLine.category !== BudgetCategory.LABOR) {
      throw new AppError(
        'INVALID_BUDGET_LINE_CATEGORY',
        `بند الموازنة يجب أن يكون من فئة الأجور والعمالة (LABOR)، الفئة الحالية: "${budgetLine.category}"`,
      );
    }

    // 3.5 BD-10 Duplicate Protection with PostgreSQL Advisory Lock
    const normalizedWorkerName = normalizePayrollWorkerName(data.workerName);
    const duplicateKey = buildPayrollDuplicateKey({
      projectId: data.projectId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      workerName: normalizedWorkerName,
    });

    // Acquire transaction-scoped exclusive advisory lock on the business key
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payroll_entry'), hashtext(${duplicateKey}))`;

    // Query active candidate records matching project and period
    const candidates = await tx.payrollEntry.findMany({
      where: {
        projectId: data.projectId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        status: { in: [PayrollStatus.DRAFT, PayrollStatus.SUBMITTED, PayrollStatus.APPROVED] },
        deletedAt: null,
      },
      select: { id: true, workerName: true },
    });

    const duplicate = candidates.find(
      (c) => normalizePayrollWorkerName(c.workerName) === normalizedWorkerName,
    );

    if (duplicate) {
      throw new AppError(
        'DUPLICATE_PAYROLL_ENTRY',
        `يوجد قيد راتب نشط بنفس المعرّف (المشروع، الفترة: ${data.periodYear}-${data.periodMonth}، والعامل: "${normalizedWorkerName}")`,
      );
    }

    // 3.6 Create PayrollEntry in DRAFT status
    const newEntry = await tx.payrollEntry.create({
      data: {
        projectId: data.projectId,
        budgetLineId: data.budgetLineId,
        workerName: normalizedWorkerName,
        workerReference: data.workerReference ?? null,
        tradeOrTitle: data.tradeOrTitle ?? null,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        amount: new Prisma.Decimal(data.amount),
        currency: 'SAR',
        description: data.description,
        status: PayrollStatus.DRAFT,
        createdById: actor.id,
      },
      include: PAYROLL_INCLUDE,
    });

    // 3.7 Write PAYROLL_ENTRY_CREATED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_CREATED',
        entityType: 'PAYROLL_ENTRY',
        entityId: newEntry.id,
        metadata: {
          projectId: newEntry.projectId,
          budgetLineId: newEntry.budgetLineId,
          workerName: newEntry.workerName,
          periodYear: newEntry.periodYear,
          periodMonth: newEntry.periodMonth,
          amount: newEntry.amount.toFixed(2),
          currency: newEntry.currency,
          status: PayrollStatus.DRAFT,
        },
      },
    });

    return newEntry;
  });

  return toPayrollSummaryDTO(created);
}
