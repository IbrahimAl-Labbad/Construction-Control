/**
 * lib/approvals/queries/get-pending-counts.ts
 *
 * Single shared COUNT query for all pending approvals.
 * Returns PendingCountsDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import type { PendingCountsDTO } from '../types';

export async function getPendingCounts(): Promise<PendingCountsDTO> {
  await requireManager();

  const [expenses, commitments, custodies, payroll, billings] = await Promise.all([
    prisma.expense.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
    prisma.commitment.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
    prisma.custody.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
    prisma.payrollEntry.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
    prisma.subcontractorBilling.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
  ]);

  return {
    expenses,
    commitments,
    custodies,
    payroll,
    billings,
    total: expenses + commitments + custodies + payroll + billings,
  };
}
