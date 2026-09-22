/**
 * lib/subcontractor-billings/queries/get-billing-form-data.ts
 *
 * Query: Returns data needed to populate the Billing creation / edit form.
 *
 * Returns:
 * - Active projects that have an APPROVED budget
 * - For each project: budget lines and APPROVED commitments
 *
 * Authorization: ACCOUNTANT only (canCreateBilling).
 * Purchasing is rejected.
 */

import { BudgetStatus, CommitmentStatus, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

// ---------------------------------------------------------------------------
// Public DTO shapes (client-safe)
// ---------------------------------------------------------------------------

export type BillingFormBudgetLine = {
  id: string;
  description: string;
  amount: string; // Decimal as string
};

export type BillingFormCommitment = {
  id: string;
  vendorName: string;
  amount: string; // Decimal as string
  referenceNumber: string | null;
  budgetLineId: string;
};

export type BillingFormProject = {
  id: string;
  name: string;
  code: string;
  lines: BillingFormBudgetLine[];
  approvedCommitments: BillingFormCommitment[];
};

export type BillingFormDataDTO = {
  projects: BillingFormProject[];
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getBillingFormData(): Promise<BillingFormDataDTO> {
  const actor = await requireAuth();
  if (!policies.canCreateBilling(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء مستخلصات مقاول باطن');
  }

  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      deletedAt: null,
      budgets: {
        some: {
          status: BudgetStatus.APPROVED,
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      budgets: {
        where: { status: BudgetStatus.APPROVED, deletedAt: null },
        select: {
          lines: {
            select: { id: true, description: true, amount: true },
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
          vendorName: true,
          amount: true,
          referenceNumber: true,
          budgetLineId: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      lines: (p.budgets[0]?.lines ?? []).map((l) => ({
        id: l.id,
        description: l.description,
        amount: l.amount.toFixed(2),
      })),
      approvedCommitments: p.commitments.map((c) => ({
        id: c.id,
        vendorName: c.vendorName,
        amount: c.amount.toFixed(2),
        referenceNumber: c.referenceNumber ?? null,
        budgetLineId: c.budgetLineId,
      })),
    })),
  };
}
