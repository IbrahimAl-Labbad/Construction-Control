/**
 * lib/payroll/use-cases/reject-payroll.ts
 *
 * Use case: Manager rejects a submitted PayrollEntry back to Accountant for corrections.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (policies.canRejectPayroll).
 * 2. Status: SUBMITTED -> REJECTED.
 * 3. Requires valid rejectionReason (validated by rejectPayrollSchema).
 * 4. Immutability of business details (amount, worker, project, budgetLine unchanged).
 * 5. Atomicity: State update + PAYROLL_ENTRY_REJECTED AuditLog in SAME transaction.
 */

import { PayrollStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  payrollIdSchema,
  rejectPayrollSchema,
} from '@/lib/validation/schemas/payroll';

import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntrySummaryDTO } from '../types';

export async function rejectPayroll(
  payrollId: unknown,
  input: unknown,
): Promise<PayrollEntrySummaryDTO> {
  // 1. Authorization (Manager only)
  const actor = await requireManager();

  // 2. Validate payrollId & rejection input
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const inputValidation = validate(rejectPayrollSchema, input);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const data = inputValidation.data;

  // 3. Execute atomic rejection transaction
  const rejected = await prisma.$transaction(async (tx) => {
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
      throw new AppError('RECORD_DELETED', 'لا يمكن رفض قيد راتب محذوف');
    }

    if (existing.status !== PayrollStatus.SUBMITTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن رفض قيد الراتب وهو في حالة "${existing.status}"، الرفض متاح فقط للقيود المقدمة (SUBMITTED)`,
      );
    }

    if (!policies.canRejectPayroll(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك برفض قيد الراتب');
    }

    const now = new Date();

    const updated = await tx.payrollEntry.update({
      where: { id },
      data: {
        status: PayrollStatus.REJECTED,
        rejectedById: actor.id,
        rejectedAt: now,
        rejectionReason: data.rejectionReason,
      },
      include: PAYROLL_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_REJECTED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updated.id,
        metadata: {
          payrollEntryId: updated.id,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          periodYear: updated.periodYear,
          periodMonth: updated.periodMonth,
          amount: updated.amount.toFixed(2),
          previousStatus: PayrollStatus.SUBMITTED,
          newStatus: PayrollStatus.REJECTED,
          rejectedById: actor.id,
          rejectedAt: now.toISOString(),
          rejectionReason: data.rejectionReason,
        },
      },
    });

    return updated;
  });

  return toPayrollSummaryDTO(rejected);
}
