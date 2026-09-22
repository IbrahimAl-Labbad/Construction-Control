/**
 * lib/payroll/use-cases/get-payroll-entry.ts
 *
 * Use case: Retrieve full details of a single PayrollEntry.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER and Role.ACCOUNTANT only (policies.canViewPayrollDetails).
 *    ENGINEER and PURCHASING are strictly denied.
 * 2. Excludes soft-deleted records (deletedAt IS NULL).
 * 3. Returns safe client DTO (toPayrollSummaryDTO) — no raw Prisma internals leaked.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { payrollIdSchema } from '@/lib/validation/schemas/payroll';

import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntrySummaryDTO } from '../types';

export async function getPayrollEntry(payrollId: unknown): Promise<PayrollEntrySummaryDTO> {
  // 1. Authentication & Role Authorization
  const actor = await requireAuth();
  if (!policies.canViewPayrollDetails(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك باستعراض تفاصيل قيد الراتب');
  }

  // 2. Validate payrollId
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Authoritative query (excluding soft-deleted records)
  const entry = await prisma.payrollEntry.findFirst({
    where: { id, deletedAt: null },
    include: PAYROLL_INCLUDE,
  });

  if (!entry) {
    throw new AppError('NOT_FOUND', 'قيد الراتب غير موجود');
  }

  return toPayrollSummaryDTO(entry);
}
