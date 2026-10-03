/**
 * lib/payroll/use-cases/update-payroll-draft.ts
 *
 * Use case: Creator Accountant updates an existing PayrollEntry draft.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Original creator Accountant only (policies.canManagePayrollDraft).
 * 2. Status: DRAFT only. Once SUBMITTED, APPROVED, or CANCELLED, edits are forbidden.
 * 3. Zod validation via updatePayrollDraftSchema.
 * 4. Revalidation of cross-entity invariants if projectId or budgetLineId changes:
 *    - project is ACTIVE and not deleted
 *    - approved budget exists
 *    - budgetLine belongs to approved budget and category === LABOR.
 * 5. BD-10 Duplicate protection:
 *    - Lexically ordered dual advisory locks if business key changes.
 *    - Excludes current record from duplicate lookup (id != existing.id).
 * 6. Immutability of server-owned fields (status, createdById, approvedById, etc.).
 * 7. Atomicity: Update + PAYROLL_ENTRY_UPDATED AuditLog in SAME transaction.
 */

import { BudgetCategory, BudgetStatus, PayrollStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  payrollIdSchema,
  updatePayrollDraftSchema,
} from '@/lib/validation/schemas/payroll';

import { buildPayrollDuplicateKey, normalizePayrollWorkerName } from '../calculations';
import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import { assertPayrollIsEditable } from '../state-machine';
import type { PayrollEntrySummaryDTO } from '../types';

export async function updatePayrollDraft(
  payrollId: unknown,
  input: unknown,
): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate payrollId & input
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const inputValidation = validate(updatePayrollDraftSchema, input);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const data = inputValidation.data;

  // 3. Execute atomic update transaction
  const updated = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch authoritative existing record
    const existing = await tx.payrollEntry.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        budgetLineId: true,
        workerName: true,
        workerReference: true,
        tradeOrTitle: true,
        periodYear: true,
        periodMonth: true,
        amount: true,
        status: true,
        createdById: true,
        deletedAt: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'قيد الراتب غير موجود');
    }

    if (existing.deletedAt !== null) {
      throw new AppError('RECORD_DELETED', 'لا يمكن تعديل قيد راتب محذوف');
    }

    // Assert status is DRAFT
    assertPayrollIsEditable(existing.status);

    // Assert creator ownership
    if (!policies.canManagePayrollDraft(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بتعديل مسودة قيد رواتب لم تقم بإنشائها');
    }

    // 3.2 Determine target entity linkages
    const targetProjectId = data.projectId ?? existing.projectId;
    const targetBudgetLineId = data.budgetLineId ?? existing.budgetLineId;
    const projectOrLineChanged =
      targetProjectId !== existing.projectId || targetBudgetLineId !== existing.budgetLineId;

    if (projectOrLineChanged) {
      const project = await tx.project.findFirst({
        where: { id: targetProjectId, deletedAt: null },
        select: { id: true, status: true },
      });

      if (!project) {
        throw new AppError('NOT_FOUND', 'المشروع غير موجود');
      }
      if (project.status !== ProjectStatus.ACTIVE) {
        throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
      }

      const approvedBudget = await tx.budget.findFirst({
        where: { projectId: targetProjectId, status: BudgetStatus.APPROVED, deletedAt: null },
        select: { id: true },
      });

      if (!approvedBudget) {
        throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
      }

      const budgetLine = await tx.budgetLine.findFirst({
        where: { id: targetBudgetLineId, budgetId: approvedBudget.id },
        select: { id: true, category: true },
      });

      if (!budgetLine) {
        throw new AppError(
          'INVALID_BUDGET_LINE',
          'بند الموازنة غير موجود أو لا يتبع للموازنة المعتمدة للمشروع',
        );
      }

      if (budgetLine.category !== BudgetCategory.LABOR) {
        throw new AppError(
          'INVALID_BUDGET_LINE_CATEGORY',
          `بند الموازنة يجب أن يكون من فئة الأجور والعمالة (LABOR)، الفئة الحالية: "${budgetLine.category}"`,
        );
      }
    }

    // 3.3 BD-10 Business Key & Advisory Lock
    const targetWorkerName =
      data.workerName !== undefined
        ? normalizePayrollWorkerName(data.workerName)
        : existing.workerName;
    const targetPeriodYear = data.periodYear ?? existing.periodYear;
    const targetPeriodMonth = data.periodMonth ?? existing.periodMonth;

    const oldKey = buildPayrollDuplicateKey({
      projectId: existing.projectId,
      periodYear: existing.periodYear,
      periodMonth: existing.periodMonth,
      workerName: existing.workerName,
    });

    const newKey = buildPayrollDuplicateKey({
      projectId: targetProjectId,
      periodYear: targetPeriodYear,
      periodMonth: targetPeriodMonth,
      workerName: targetWorkerName,
    });

    // Acquire locks in deterministic lexical order to prevent deadlocks
    if (oldKey === newKey) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payroll_entry'), hashtext(${newKey}))`;
    } else {
      const sortedKeys = oldKey < newKey ? [oldKey, newKey] : [newKey, oldKey];
      for (const k of sortedKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payroll_entry'), hashtext(${k}))`;
      }
    }

    // Check for active duplicate excluding the current entry
    const candidates = await tx.payrollEntry.findMany({
      where: {
        id: { not: existing.id },
        projectId: targetProjectId,
        periodYear: targetPeriodYear,
        periodMonth: targetPeriodMonth,
        status: { in: [PayrollStatus.DRAFT, PayrollStatus.SUBMITTED, PayrollStatus.APPROVED] },
        deletedAt: null,
      },
      select: { id: true, workerName: true },
    });

    const duplicate = candidates.find(
      (c) => normalizePayrollWorkerName(c.workerName) === targetWorkerName,
    );

    if (duplicate) {
      throw new AppError(
        'DUPLICATE_PAYROLL_ENTRY',
        `يوجد قيد راتب نشط بنفس المعرّف (المشروع، الفترة: ${targetPeriodYear}-${targetPeriodMonth}، والعامل: "${targetWorkerName}")`,
      );
    }

    // 3.4 Build update payload
    const updateData: Prisma.PayrollEntryUpdateInput = {};
    if (data.workerName !== undefined) updateData.workerName = targetWorkerName;
    if (data.workerReference !== undefined) updateData.workerReference = data.workerReference;
    if (data.tradeOrTitle !== undefined) updateData.tradeOrTitle = data.tradeOrTitle;
    if (data.periodYear !== undefined) updateData.periodYear = data.periodYear;
    if (data.periodMonth !== undefined) updateData.periodMonth = data.periodMonth;
    if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.projectId !== undefined) updateData.project = { connect: { id: data.projectId } };
    if (data.budgetLineId !== undefined) {
      updateData.budgetLine = { connect: { id: data.budgetLineId } };
    }

    const updatedEntry = await tx.payrollEntry.update({
      where: { id },
      data: updateData,
      include: PAYROLL_INCLUDE,
    });

    // 3.5 Write PAYROLL_ENTRY_UPDATED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_UPDATED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updatedEntry.id,
        metadata: {
          payrollEntryId: updatedEntry.id,
          projectId: updatedEntry.projectId,
          budgetLineId: updatedEntry.budgetLineId,
          workerName: updatedEntry.workerName,
          periodYear: updatedEntry.periodYear,
          periodMonth: updatedEntry.periodMonth,
          previousAmount: existing.amount.toFixed(2),
          newAmount: updatedEntry.amount.toFixed(2),
        },
      },
    });

    return updatedEntry;
  });

  return toPayrollSummaryDTO(updated);
}
