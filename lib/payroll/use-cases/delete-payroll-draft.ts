/**
 * lib/payroll/use-cases/delete-payroll-draft.ts
 *
 * Use case: Creator Accountant soft-deletes a PayrollEntry draft.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Original creator Accountant only (policies.canManagePayrollDraft).
 * 2. Status: DRAFT only. SUBMITTED, APPROVED, REJECTED, and CANCELLED cannot be deleted.
 * 3. Soft deletion: Sets deletedAt timestamp (AGENTS.md §14).
 * 4. Atomicity: Soft delete + PAYROLL_ENTRY_DELETED AuditLog in SAME transaction.
 */

import { PayrollStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { payrollIdSchema } from '@/lib/validation/schemas/payroll';

export type DeletePayrollDraftResult = {
  success: boolean;
  payrollId: string;
};

export async function deletePayrollDraft(payrollId: unknown): Promise<DeletePayrollDraftResult> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate payrollId
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic soft delete transaction
  await prisma.$transaction(async (tx) => {
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
      throw new AppError('RECORD_DELETED', 'قيد الراتب محذوف بالفعل');
    }

    if (existing.status !== PayrollStatus.DRAFT) {
      throw new AppError(
        'RECORD_NOT_EDITABLE',
        `لا يمكن حذف قيد الراتب في الحالة الحالية: "${existing.status}". الحذف متاح فقط للمسودات (DRAFT)`,
      );
    }

    if (!policies.canManagePayrollDraft(actor, existing)) {
      throw new AppError('FORBIDDEN', 'غير مصرح لك بحذف مسودة قيد رواتب لم تقم بإنشائها');
    }

    const now = new Date();

    // Soft delete record
    await tx.payrollEntry.update({
      where: { id },
      data: {
        deletedAt: now,
      },
    });

    // Write PAYROLL_ENTRY_DELETED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_DELETED',
        entityType: 'PAYROLL_ENTRY',
        entityId: existing.id,
        metadata: {
          payrollEntryId: existing.id,
          projectId: existing.projectId,
          budgetLineId: existing.budgetLineId,
          workerName: existing.workerName,
          amount: existing.amount.toFixed(2),
          status: existing.status,
          deletedAt: now.toISOString(),
        },
      },
    });
  });

  return { success: true, payrollId: id };
}
