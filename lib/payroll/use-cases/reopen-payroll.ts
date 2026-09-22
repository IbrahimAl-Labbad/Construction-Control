/**
 * lib/payroll/use-cases/reopen-payroll.ts
 *
 * Use case: Creator Accountant reopens a rejected PayrollEntry back to DRAFT for editing.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Original creator Accountant only (policies.canReopenPayroll).
 * 2. Status: REJECTED -> DRAFT.
 * 3. Clears rejection tracking fields (rejectedById, rejectedAt, rejectionReason).
 * 4. Atomicity: State transition + PAYROLL_ENTRY_REOPENED AuditLog in SAME transaction.
 */

import { PayrollStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { payrollIdSchema } from '@/lib/validation/schemas/payroll';

import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntrySummaryDTO } from '../types';

export async function reopenPayroll(payrollId: unknown): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate payrollId
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic reopen transaction
  const reopened = await prisma.$transaction(async (tx) => {
    const existing = await tx.payrollEntry.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        budgetLineId: true,
        workerName: true,
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
      throw new AppError('RECORD_DELETED', 'لا يمكن إعادة فتح قيد راتب محذوف');
    }

    if (existing.status !== PayrollStatus.REJECTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن إعادة فتح قيد الراتب وهو في حالة "${existing.status}"، إعادة الفتح متاحة فقط للقيود المرفوضة (REJECTED)`,
      );
    }

    if (!policies.canReopenPayroll(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بإعادة فتح قيد راتب لم تقم بإنشائه');
    }

    const now = new Date();

    const updated = await tx.payrollEntry.update({
      where: { id },
      data: {
        status: PayrollStatus.DRAFT,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: PAYROLL_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_REOPENED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updated.id,
        metadata: {
          payrollEntryId: updated.id,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          periodYear: updated.periodYear,
          periodMonth: updated.periodMonth,
          amount: updated.amount.toFixed(2),
          previousStatus: PayrollStatus.REJECTED,
          newStatus: PayrollStatus.DRAFT,
          reopenedById: actor.id,
          reopenedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toPayrollSummaryDTO(reopened);
}
