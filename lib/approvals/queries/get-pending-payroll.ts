/**
 * lib/approvals/queries/get-pending-payroll.ts
 *
 * Fetches paginated pending payroll entry approvals.
 * Lean projection: selects only fields required by PayrollApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toPayrollApprovalItemDTO } from '../mappers';
import type { PayrollApprovalItemDTO } from '../types';

export const PENDING_PAYROLL_SELECT = {
  id: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  amount: true,
  currency: true,
  workerName: true,
  tradeOrTitle: true,
  periodYear: true,
  periodMonth: true,
  description: true,
  status: true,
  createdBy: { select: { name: true } },
  submittedAt: true,
  createdAt: true,
} as const;

export async function getPendingPayroll(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: PayrollApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.payrollEntry.findMany({
      where,
      select: PENDING_PAYROLL_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.payrollEntry.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toPayrollApprovalItemDTO({
      id: item.id,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      amount: item.amount,
      currency: item.currency,
      workerName: item.workerName,
      tradeOrTitle: item.tradeOrTitle,
      periodYear: item.periodYear,
      periodMonth: item.periodMonth,
      description: item.description,
      status: item.status,
      createdBy: item.createdBy,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
    })
  );

  return { items, totalItems };
}
