/**
 * lib/approvals/queries/get-pending-commitments.ts
 *
 * Fetches paginated pending commitment approvals.
 * Lean projection: selects only fields required by CommitmentApprovalItemDTO.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { toCommitmentApprovalItemDTO } from '../mappers';
import type { CommitmentApprovalItemDTO } from '../types';

export const PENDING_COMMITMENTS_SELECT = {
  id: true,
  projectId: true,
  project: { select: { code: true, name: true } },
  budgetLine: { select: { category: true, description: true } },
  amount: true,
  currency: true,
  vendorName: true,
  referenceNumber: true,
  commitmentDate: true,
  description: true,
  status: true,
  createdBy: { select: { name: true } },
  submittedBy: { select: { name: true } },
  submittedAt: true,
  createdAt: true,
} as const;

export async function getPendingCommitments(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: CommitmentApprovalItemDTO[]; totalItems: number }> {
  await requireManager();

  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, params?.pageSize ?? 20);
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const [rawItems, totalItems] = await Promise.all([
    prisma.commitment.findMany({
      where,
      select: PENDING_COMMITMENTS_SELECT,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.commitment.count({ where }),
  ]);

  const items = rawItems.map((item) =>
    toCommitmentApprovalItemDTO({
      id: item.id,
      projectId: item.projectId,
      project: item.project,
      budgetLine: item.budgetLine,
      amount: item.amount,
      currency: item.currency,
      vendorName: item.vendorName,
      referenceNumber: item.referenceNumber,
      commitmentDate: item.commitmentDate,
      description: item.description,
      status: item.status,
      createdBy: item.createdBy,
      submittedBy: item.submittedBy,
      submittedAt: item.submittedAt,
      createdAt: item.createdAt,
    })
  );

  return { items, totalItems };
}
