/**
 * lib/custodies/use-cases/issue-custody.ts
 *
 * Use case: Accountant disburses physical cash for an APPROVED custody.
 *
 * Enforces Invariants 3, 7, 10:
 * 1. Authorization: Role.ACCOUNTANT exclusively (cash disbursement authority).
 * 2. State machine transition: APPROVED -> ISSUED.
 * 3. Lock Hierarchy (Canonical Order):
 *    1. SELECT id, amount FROM budget_lines WHERE id = ... FOR UPDATE
 *    2. SELECT id, status, amount FROM custodies WHERE id = ... FOR UPDATE
 * 4. Authoritative BudgetLine hard-cap gate (Invariant 10):
 *    - Re-aggregates Approved Commitments + Approved Expenses (Direct & Custody) + Existing Outstanding Custodies.
 *    - Enforces hard ceiling: currentExposure + custody.amount <= BudgetLine.amount.
 * 5. Atomicity: Status update + CUSTODY_ISSUED AuditLog in SAME transaction.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  ProjectStatus,
  Role,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import { isBudgetLineOverCeiling, calculateRemainingBudgetLineBalance } from '@/lib/budget';
import { sumOutstandingCustodyBalances } from '../calculations';
import type { CustodySummaryDTO } from '../types';

export async function issueCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ACCOUNTANT exclusively
  const actor = await requireRole(Role.ACCOUNTANT);

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      status: true,
      budgetLineId: true,
      amount: true,
      projectId: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  // 4. Assert state machine transition (APPROVED -> ISSUED)
  assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.ISSUED);

  // 5. Execute atomic issuance transaction with Canonical Lock Hierarchy
  const now = new Date();
  let issued;
  try {
    issued = await prisma.$transaction(async (tx) => {
    // 5.1 STEP 1: Lock the parent BudgetLine row (Canonical Lock Order 1)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 5.2 STEP 2: Lock the Custody row (Canonical Lock Order 2)
    const lockedCustodies = await tx.$queryRaw<Array<{ id: string; status: CustodyStatus; amount: Prisma.Decimal }>>`
      SELECT id, status, amount FROM custodies
      WHERE id = ${id}
      FOR UPDATE
    `;

    const lockedCustody = lockedCustodies[0];
    if (!lockedCustody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة');
    }

    if (lockedCustody.status !== CustodyStatus.APPROVED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن صرف العهدة وهي في حالة "${lockedCustody.status}"، يجب أن تكون معتمدة من المدير (APPROVED)`,
      );
    }

    // 5.3 Revalidate project & budget invariants
    const project = await tx.project.findFirst({
      where: { id: preCheck.projectId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!project || project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: preCheck.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 5.4 Authoritative BudgetLine Hard-Cap Gate (Invariant 10)
    // A. Aggregate APPROVED commitments on this line
    const commitmentsAgg = await tx.commitment.aggregate({
      where: {
        budgetLineId: preCheck.budgetLineId,
        status: CommitmentStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    });
    const approvedCommitments = commitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');

    // B. Aggregate APPROVED expenses on this line (both direct and custody-settled)
    const expensesAgg = await tx.expense.aggregate({
      where: {
        budgetLineId: preCheck.budgetLineId,
        status: ExpenseStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    });
    const approvedExpenses = expensesAgg._sum.amount ?? new Prisma.Decimal('0.00');

    // C. Aggregate existing active Outstanding Custodies on this line (excluding current)
    const otherActiveCustodies = await tx.custody.findMany({
      where: {
        id: { not: id },
        budgetLineId: preCheck.budgetLineId,
        status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
        deletedAt: null,
      },
      include: {
        expenses: {
          where: { status: ExpenseStatus.APPROVED, deletedAt: null },
          select: { amount: true },
        },
      },
    });

    const existingOutstandingCustodies = sumOutstandingCustodyBalances(otherActiveCustodies);

    // D. Aggregate APPROVED payroll entries on this line
    const payrollAgg = tx.payrollEntry
      ? await tx.payrollEntry.aggregate({
          where: {
            budgetLineId: preCheck.budgetLineId,
            status: PayrollStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : { _sum: { amount: null } };
    const approvedPayroll = payrollAgg._sum.amount ?? new Prisma.Decimal('0.00');

    // Total Current Active Exposure
    const currentActiveExposure = approvedCommitments
      .add(approvedExpenses)
      .add(existingOutstandingCustodies)
      .add(approvedPayroll);

    const newTotalExposure = currentActiveExposure.add(lockedCustody.amount);

    // Enforce hard ceiling
    if (isBudgetLineOverCeiling(currentActiveExposure, lockedCustody.amount, lockedLine.amount)) {
      const remainingAvailable = calculateRemainingBudgetLineBalance(lockedLine.amount, currentActiveExposure);
      throw new AppError(
        'BUDGET_LINE_EXCEEDED',
        `مبلغ العهدة (${lockedCustody.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
      );
    }

    // 5.5 Update custody status to ISSUED
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.ISSUED,
        issuedById: actor.id,
        issuedAt: now,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 5.6 Write CUSTODY_ISSUED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_ISSUED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          previousActiveExposure: currentActiveExposure.toFixed(2),
          newTotalExposure: newTotalExposure.toFixed(2),
          remainingLineBalance: lockedLine.amount.sub(newTotalExposure).toFixed(2),
          issuedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });
} catch (error) {
  if (!(error instanceof AppError)) {
    logger.error('custody.issuance_transaction_failed', {
      custodyId: id,
      actorId: actor.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  throw error;
}

logger.info('custody.issued', {
  custodyId: issued.id,
  projectId: issued.projectId,
  budgetLineId: issued.budgetLineId,
  actorId: actor.id,
  amount: issued.amount.toFixed(2),
});

return toCustodySummaryDTO(issued);
}
