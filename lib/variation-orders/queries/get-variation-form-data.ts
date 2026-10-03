/**
 * lib/variation-orders/queries/get-variation-form-data.ts
 *
 * Query: Returns projects, budget lines, and commitments accessible
 * to the authenticated user for populating the Variation Order creation/editing form.
 *
 * Follows AGENTS.md §8, §12, §18.
 */

import { AssignmentStatus, BudgetStatus, CommitmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

export interface VariationFormProjectDTO {
  id: string;
  name: string;
  code: string;
  budgetLines: Array<{
    id: string;
    category: string;
    description: string;
    amount: string;
  }>;
  commitments: Array<{
    id: string;
    orderNumber: string;
    description: string;
    vendorName: string;
    allocatedAmount: string;
  }>;
}

export async function getVariationFormData(): Promise<VariationFormProjectDTO[]> {
  const actor = await requireAuth();

  if (!policies.canCreateVariationOrder(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء أوامر التغيير');
  }

  // Base where clause for projects
  const whereClause: {
    status: ProjectStatus;
    deletedAt: null;
    assignments?: {
      some: {
        engineerId: string;
        status: AssignmentStatus;
      };
    };
  } = {
    status: ProjectStatus.ACTIVE,
    deletedAt: null,
  };

  // If engineer, scope to assigned projects only
  if (actor.role === Role.ENGINEER) {
    whereClause.assignments = {
      some: {
        engineerId: actor.id,
        status: AssignmentStatus.ACTIVE,
      },
    };
  }

  const projects = await prisma.project.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      code: true,
      budgets: {
        where: {
          status: BudgetStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          lines: {
            select: {
              id: true,
              category: true,
              description: true,
              amount: true,
            },
            orderBy: { category: 'asc' },
          },
        },
      },
      commitments: {
        where: {
          status: CommitmentStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          id: true,
          referenceNumber: true,
          description: true,
          vendorName: true,
          amount: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    budgetLines: (p.budgets[0]?.lines ?? []).map((l) => ({
      id: l.id,
      category: l.category,
      description: l.description,
      amount: l.amount.toFixed(2),
    })),
    commitments: p.commitments.map((c) => ({
      id: c.id,
      orderNumber: c.referenceNumber ?? c.id.slice(-6).toUpperCase(),
      description: c.description ?? '',
      vendorName: c.vendorName,
      allocatedAmount: c.amount.toFixed(2),
    })),
  }));
}
