/**
 * lib/payroll/use-cases/cancel-payroll.ts
 *
 * Use case: Void/cancel a PayrollEntry before formal approval.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization & Status Matrix (policies.canCancelPayroll):
 *    - DRAFT: Creator Accountant OR Manager may cancel.
 *    - SUBMITTED: Manager ONLY may cancel.
 *    - REJECTED: Denied for all.
 *    - APPROVED: Denied for all (strictly immutable ledger record).
 *    - CANCELLED: Denied for all (terminal state).
 * 2. Requires non-empty cancellationReason (min 5 chars, validated by cancelPayrollSchema).
 * 3. Does not alter original financial attributes (amount, currency, project, budgetLine).
 * 4. Atomicity: State transition + PAYROLL_ENTRY_CANCELLED AuditLog in SAME transaction.
 */

import { PayrollStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  cancelPayrollSchema,
  payrollIdSchema,
} from '@/lib/validation/schemas/payroll';

import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntrySummaryDTO } from '../types';

export async function cancelPayroll(
  payrollId: unknown,
  input: unknown,
): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate payrollId & cancellation input
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const inputValidation = validate(cancelPayrollSchema, input);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const data = inputValidation.data;

  // 3. Execute atomic cancellation transaction
  const cancelled = await prisma.$transaction(async (tx) => {
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
      throw new AppError('RECORD_DELETED', 'لا يمكن إلغاء قيد راتب محذوف');
    }

    if (existing.status === PayrollStatus.APPROVED || existing.status === PayrollStatus.CANCELLED) {
      throw new AppError(
        'RECORD_NOT_EDITABLE',
        `لا يمكن إلغاء قيد الراتب وهو في حالة نهائية: "${existing.status}"`,
      );
    }

    if (existing.status === PayrollStatus.REJECTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'لا يمكن إلغاء قيد الراتب وهو في حالة مرفوض (REJECTED)، يجب إعادة فتحه أولاً أو تركه',
      );
    }

    if (!policies.canCancelPayroll(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بإلغاء قيد الراتب');
    }

    const now = new Date();

    const updated = await tx.payrollEntry.update({
      where: { id },
      data: {
        status: PayrollStatus.CANCELLED,
        cancelledById: actor.id,
        cancelledAt: now,
        cancellationReason: data.cancellationReason,
      },
      include: PAYROLL_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_CANCELLED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updated.id,
        metadata: {
          payrollEntryId: updated.id,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          previousStatus: existing.status,
          newStatus: PayrollStatus.CANCELLED,
          cancelledById: actor.id,
          cancelledAt: now.toISOString(),
          cancellationReason: data.cancellationReason,
        },
      },
    });

    return updated;
  });

  return toPayrollSummaryDTO(cancelled);
}
