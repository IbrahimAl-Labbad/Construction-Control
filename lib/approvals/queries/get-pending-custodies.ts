/**
 * lib/approvals/queries/get-pending-custodies.ts
 *
 * Fetches paginated pending custody approvals.
 * Lean projection: selects only fields required by CustodyApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toCustodyApprovalItemDTO } from '../mappers';
import type { CustodyApprovalItemDTO } from '../types';

export const PENDING_CUSTODIES_SELECT = {
  id: true,
  code: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  amount: true,
  currency: true,
  purpose: true,
  status: true,
  createdBy: { select: { name: true } },
  custodian: { select: { name: true } },
  expectedSettlementDate: true,
  submittedAt: true,
  createdAt: true,
} as const;

export async function getPendingCustodies(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: CustodyApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.custody.findMany({
      where,
      select: PENDING_CUSTODIES_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.custody.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toCustodyApprovalItemDTO({
      id: item.id,
      code: item.code,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      amount: item.amount,
      currency: item.currency,
      purpose: item.purpose,
      status: item.status,
      createdBy: item.createdBy,
      custodian: item.custodian,
      expectedSettlementDate: item.expectedSettlementDate,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
    })
  );

  return { items, totalItems };
}
