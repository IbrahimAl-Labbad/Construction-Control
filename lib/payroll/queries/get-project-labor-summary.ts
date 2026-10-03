/**
 * lib/payroll/queries/get-project-labor-summary.ts
 *
 * Query: Returns project-level labor cost and budget summary.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Authorization:
 * - MANAGER: Allowed (canViewProjectLaborAggregate).
 * - ACCOUNTANT: Allowed (canViewProjectLaborAggregate).
 * - PURCHASING: Hard deny (throws FORBIDDEN).
 * - ENGINEER: Fail-closed. Allowed ONLY if a validated safe project-scope mechanism
 *   proves the engineer is assigned to or has verified access to the specific project.
 *   If scopeResolution is omitted or unverified, throws FORBIDDEN.
 *
 * Privacy / DTO boundary (AGENTS.md §26, BD-14):
 * - Engineer/Client receives ONLY aggregate summary numbers.
 * - MUST NOT contain workerName, workerReference, tradeOrTitle, individual amounts,
 *   individual statuses, or individual entry IDs.
 *
 * Financial Invariants (BD-09, BD-15):
 * - Reuses calculateBudgetLineExposure() for canonical exposure logic.
 * - Approved Payroll is integrated into active exposure.
 * - SubcontractorBilling is NOT counted separately (contract value captured by commitments).
 * - Custody actual spend and outstanding custodies follow established Slice 6 semantics.
 * - Exact Prisma.Decimal arithmetic; all monetary return values are strings.
 */

import {
  BudgetCategory,
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  Prisma,
} from '@prisma/client';

import { calculateBudgetLineExposure, sumOutstandingCustodyBalances } from '@/lib/custodies/calculations';
import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { toProjectLaborSummaryDTO } from '../mappers';
import type { ProjectLaborSummaryDTO } from '../types';
import { getBudgetLinePayrollExposure } from './get-budget-line-payroll-exposure';

export async function getProjectLaborSummary(
  projectId: string,
  scopeResolution?: { hasProjectAccess?: boolean; isAssignedEngineer?: boolean } | boolean,
): Promise<ProjectLaborSummaryDTO> {
  // 1. Authentication & Fail-Closed Authorization
  const actor = await requireAuth();
  if (!policies.canViewProjectLaborAggregate(actor, scopeResolution)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض ملخص موازنة أجور المشروع');
  }

  // 2. Validate projectId
  if (!projectId || typeof projectId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'معرّف المشروع مطلوب');
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 3. Find project's approved budget and all LABOR lines
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    select: {
      id: true,
      lines: {
        where: { category: BudgetCategory.LABOR },
        select: { id: true, amount: true },
      },
    },
  });

  const laborLines = approvedBudget?.lines ?? [];

  if (laborLines.length === 0) {
    return toProjectLaborSummaryDTO({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      totalLaborBudget: '0.00',
      approvedLaborSpend: '0.00',
      pendingLaborSpend: '0.00',
      remainingLaborBudget: '0.00',
      currency: 'SAR',
      laborBudgetLinesCount: 0,
    });
  }

  // 4. Calculate exposure across all LABOR budget lines
  let totalLaborBudget = new Prisma.Decimal('0.00');
  let approvedLaborSpend = new Prisma.Decimal('0.00');
  let pendingLaborSpend = new Prisma.Decimal('0.00');
  let remainingLaborBudget = new Prisma.Decimal('0.00');

  for (const line of laborLines) {
    totalLaborBudget = totalLaborBudget.add(line.amount);

    const [
      approvedCommitmentsAgg,
      directExpensesAgg,
      custodyExpensesAgg,
      activeCustodies,
      payrollExposure,
    ] = await Promise.all([
      prisma.commitment.aggregate({
        where: {
          budgetLineId: line.id,
          status: CommitmentStatus.APPROVED,
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          budgetLineId: line.id,
          status: ExpenseStatus.APPROVED,
          custodyId: null,
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          budgetLineId: line.id,
          status: ExpenseStatus.APPROVED,
          custodyId: { not: null },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      prisma.custody.findMany({
        where: {
          budgetLineId: line.id,
          status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
          deletedAt: null,
        },
        include: {
          expenses: {
            where: { status: ExpenseStatus.APPROVED, deletedAt: null },
            select: { amount: true },
          },
        },
      }),
      getBudgetLinePayrollExposure(line.id),
    ]);

    const approvedCommitments =
      approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const directActualSpend =
      directExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const custodyActualSpend =
      custodyExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const approvedPayroll = payrollExposure.approvedPayroll;
    const pendingPayroll = payrollExposure.pendingPayroll;

    const outstandingCustodies = sumOutstandingCustodyBalances(activeCustodies);

    const exposure = calculateBudgetLineExposure({
      authorizedAmount: line.amount,
      approvedCommitments,
      directActualSpend,
      custodyActualSpend,
      outstandingCustodies,
      approvedPayroll,
      pendingPayroll,
    });

    approvedLaborSpend = approvedLaborSpend.add(exposure.totalActiveExposure);
    remainingLaborBudget = remainingLaborBudget.add(exposure.availableBalance);
    pendingLaborSpend = pendingLaborSpend.add(pendingPayroll);
  }

  return toProjectLaborSummaryDTO({
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    totalLaborBudget,
    approvedLaborSpend,
    pendingLaborSpend,
    remainingLaborBudget,
    currency: 'SAR',
    laborBudgetLinesCount: laborLines.length,
  });
}
