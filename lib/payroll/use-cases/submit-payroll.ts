/**
 * lib/payroll/use-cases/submit-payroll.ts
 *
 * Use case: Creator Accountant formally submits a PayrollEntry draft for Manager approval.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Original creator Accountant only (policies.canSubmitPayroll).
 * 2. Status: DRAFT -> SUBMITTED.
 * 3. Server-authoritative revalidation of invariants:
 *    - Project must exist and be ACTIVE.
 *    - Project must have an APPROVED budget.
 *    - BudgetLine must belong to approved budget and category === LABOR.
 *    - Currency is SAR and amount > 0.
 * 4. BD-10 Duplicate protection:
 *    - Advisory lock on business key.
 *    - Excludes current entry id (id != existing.id).
 * 5. Atomicity: State transition + PAYROLL_ENTRY_SUBMITTED AuditLog in SAME transaction.
 */

import { BudgetCategory, BudgetStatus, PayrollStatus, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { payrollIdSchema } from '@/lib/validation/schemas/payroll';

import { buildPayrollDuplicateKey, normalizePayrollWorkerName } from '../calculations';
import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import { assertValidPayrollTransition } from '../state-machine';
import type { PayrollEntrySummaryDTO } from '../types';

export async function submitPayroll(payrollId: unknown): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate payrollId
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic submit transaction
  const submitted = await prisma.$transaction(async (tx) => {
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
        currency: true,
        status: true,
        createdById: true,
        deletedAt: true,
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'قيد الراتب غير موجود');
    }

    if (existing.deletedAt !== null) {
      throw new AppError('RECORD_DELETED', 'لا يمكن تقديم قيد راتب محذوف');
    }

    assertValidPayrollTransition(existing.status, PayrollStatus.SUBMITTED);

    if (!policies.canSubmitPayroll(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بتقديم مسودة قيد رواتب لم تقم بإنشائها');
    }

    // 3.1 Revalidate invariants
    const project = await tx.project.findFirst({
      where: { id: existing.projectId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }
    if (project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    const approvedBudget = await tx.budget.findFirst({
      where: { projectId: existing.projectId, status: BudgetStatus.APPROVED, deletedAt: null },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    const budgetLine = await tx.budgetLine.findFirst({
      where: { id: existing.budgetLineId, budgetId: approvedBudget.id },
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

    if (existing.amount.lessThanOrEqualTo(0)) {
      throw new AppError('INVALID_PAYROLL_AMOUNT', 'مبلغ قيد الراتب يجب أن يكون أكبر من الصفر');
    }

    if (existing.currency !== 'SAR') {
      throw new AppError('INVALID_PAYROLL_CURRENCY', 'العملة يجب أن تكون الريال السعودي (SAR)');
    }

    // 3.2 BD-10 Duplicate check with advisory lock
    const normalizedWorkerName = normalizePayrollWorkerName(existing.workerName);
    const duplicateKey = buildPayrollDuplicateKey({
      projectId: existing.projectId,
      periodYear: existing.periodYear,
      periodMonth: existing.periodMonth,
      workerName: normalizedWorkerName,
    });

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payroll_entry'), hashtext(${duplicateKey}))`;

    const candidates = await tx.payrollEntry.findMany({
      where: {
        id: { not: existing.id },
        projectId: existing.projectId,
        periodYear: existing.periodYear,
        periodMonth: existing.periodMonth,
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
        `يوجد قيد راتب نشط بنفس المعرّف (المشروع، الفترة: ${existing.periodYear}-${existing.periodMonth}، والعامل: "${normalizedWorkerName}")`,
      );
    }

    const now = new Date();

    // 3.3 Mutate to SUBMITTED
    const updated = await tx.payrollEntry.update({
      where: { id },
      data: {
        status: PayrollStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: now,
      },
      include: PAYROLL_INCLUDE,
    });

    // 3.4 Write PAYROLL_ENTRY_SUBMITTED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_SUBMITTED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updated.id,
        metadata: {
          payrollEntryId: updated.id,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          periodYear: updated.periodYear,
          periodMonth: updated.periodMonth,
          amount: updated.amount.toFixed(2),
          currency: updated.currency,
          previousStatus: PayrollStatus.DRAFT,
          newStatus: PayrollStatus.SUBMITTED,
          submittedById: actor.id,
          submittedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toPayrollSummaryDTO(submitted);
}
