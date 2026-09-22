/**
 * lib/payroll/queries/get-payroll-form-data.ts
 *
 * Query: Returns data necessary to populate the Payroll creation / edit form.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Authorization:
 * - ACCOUNTANT and MANAGER only.
 * - ENGINEER and PURCHASING are strictly blocked (throws FORBIDDEN).
 *
 * Returns:
 * - Active projects that have an APPROVED budget with LABOR category budget lines.
 * - Non-labor lines (MATERIALS, EQUIPMENT, SUBCONTRACTOR) are strictly excluded.
 * - Soft-deleted records and unapproved budgets are excluded.
 * - No worker/employee master data or salary history is exposed.
 */

import { BudgetCategory, BudgetStatus, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { isAccountant, isManager } from '@/lib/permissions/roles';

import { toPayrollFormDataDTO } from '../mappers';
import type { PayrollFormDataDTO } from '../types';

export async function getPayrollFormData(): Promise<PayrollFormDataDTO> {
  // 1. Authorization (Accountant and Manager only)
  const actor = await requireAuth();
  if (!actor.isActive || (!isAccountant(actor.role) && !isManager(actor.role))) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بالوصول إلى بيانات نموذج الرواتب');
  }

  // 2. Fetch active projects having an approved budget with LABOR lines
  const rawProjects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      deletedAt: null,
      budgets: {
        some: {
          status: BudgetStatus.APPROVED,
          deletedAt: null,
          lines: {
            some: {
              category: BudgetCategory.LABOR,
            },
          },
        },
      },
    },
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
            where: {
              category: BudgetCategory.LABOR,
            },
            select: {
              id: true,
              description: true,
              amount: true,
              category: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 3. Format into client-safe DTO using canonical mapper
  return toPayrollFormDataDTO(rawProjects);
}
