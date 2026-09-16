/**
 * lib/commitments/queries/get-user-commitments.ts
 *
 * Query: Fetches commitments for the currently authenticated user.
 *
 * Scope:
 * - If Role.MANAGER: sees all commitments across projects.
 * - Other roles: sees commitments they created or submitted.
 * Soft-deleted records are excluded.
 */

import { Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/permissions';

import { toCommitmentSummaryDTO } from '../mappers';
import type { CommitmentSummaryDTO } from '../types';

export async function getUserCommitments(): Promise<CommitmentSummaryDTO[]> {
  const actor = await requireAuth();

  const whereClause =
    actor.role === Role.MANAGER
      ? { deletedAt: null }
      : {
          deletedAt: null,
          OR: [{ createdById: actor.id }, { submittedById: actor.id }],
        };

  const commitments = await prisma.commitment.findMany({
    where: whereClause,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return commitments.map(toCommitmentSummaryDTO);
}
