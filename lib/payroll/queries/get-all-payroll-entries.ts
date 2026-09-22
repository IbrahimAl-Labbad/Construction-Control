/**
 * lib/payroll/queries/get-all-payroll-entries.ts
 *
 * Query: Returns all non-deleted PayrollEntry records across all projects.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Authorization:
 * - MANAGER and ACCOUNTANT only (policies.canViewPayrollDetails).
 * - ENGINEER and PURCHASING are strictly blocked (throws FORBIDDEN).
 *
 * Excludes soft-deleted records (deletedAt IS NULL).
 * Returns client-safe DTOs via toPayrollSummaryDTO.
 */

import type { Prisma } from '@prisma/client';
import { PayrollStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { PAYROLL_INCLUDE, toPayrollSummaryDTO } from '../mappers';
import type { PayrollEntryFilters, PayrollEntrySummaryDTO } from '../types';

export async function getAllPayrollEntries(
  filters?: PayrollEntryFilters,
): Promise<PayrollEntrySummaryDTO[]> {
  // 1. Authorization
  const actor = await requireAuth();
  if (!policies.canViewPayrollDetails(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض قيود الرواتب');
  }

  // 2. Build where filter with strict soft-delete exclusion
  const where: Prisma.PayrollEntryWhereInput = {
    deletedAt: null,
  };

  if (filters?.projectId && typeof filters.projectId === 'string') {
    where.projectId = filters.projectId.trim();
  }

  if (filters?.status && Object.values(PayrollStatus).includes(filters.status)) {
    where.status = filters.status;
  }

  if (typeof filters?.periodYear === 'number' && !Number.isNaN(filters.periodYear)) {
    where.periodYear = Math.floor(filters.periodYear);
  }

  if (typeof filters?.periodMonth === 'number' && !Number.isNaN(filters.periodMonth)) {
    where.periodMonth = Math.floor(filters.periodMonth);
  }

  if (filters?.workerName && typeof filters.workerName === 'string') {
    const term = filters.workerName.trim();
    if (term.length > 0) {
      where.workerName = { contains: term, mode: 'insensitive' };
    }
  }

  // 3. Query records with relations
  const raw = await prisma.payrollEntry.findMany({
    where,
    include: PAYROLL_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return raw.map(toPayrollSummaryDTO);
}
