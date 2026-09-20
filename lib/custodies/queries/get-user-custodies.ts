/**
 * lib/custodies/queries/get-user-custodies.ts
 *
 * Query: Fetches custodies for the currently authenticated user based on role scope.
 *
 * Scope:
 * - If Role.MANAGER or Role.ACCOUNTANT: sees all custodies across projects.
 * - If Role.ENGINEER: sees custodies where they are the custodian or creator.
 * Soft-deleted records are excluded.
 */

import { Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/permissions';

import { toCustodySummaryDTO } from '../mappers';
import type { CustodySummaryDTO } from '../types';

export async function getUserCustodies(): Promise<CustodySummaryDTO[]> {
  const actor = await requireAuth();

  const whereClause =
    actor.role === Role.MANAGER || actor.role === Role.ACCOUNTANT
      ? { deletedAt: null }
      : {
          deletedAt: null,
          OR: [{ custodianUserId: actor.id }, { createdById: actor.id }],
        };

  const custodies = await prisma.custody.findMany({
    where: whereClause,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      custodian: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, code: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      expenses: {
        where: { deletedAt: null },
        select: { id: true, amount: true, status: true, deletedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return custodies.map(toCustodySummaryDTO);
}
