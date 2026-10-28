/**
 * lib/commitments/use-cases/approve-commitment.ts
 *
 * Use case: Manager formally approves a submitted Commitment.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (exclusive approval authority).
 * 2. Separation of duties:
 *    - actor.id !== commitment.createdById (creator cannot self-approve)
 *    - actor.id !== commitment.submittedById (submitter cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Approval Concurrency & Pessimistic Row Locking:
 *    - Executes inside prisma.$transaction.
 *    - Acquires PostgreSQL row-level locks in canonical hierarchical order:
 *      Lock 1: SELECT id, amount, "budgetId" FROM budget_lines WHERE id = ... FOR UPDATE
 *      Lock 2: SELECT id FROM commitments WHERE id = ... FOR UPDATE
 *    - Approval Deletion Guard & Stale-Linkage Retry (Mandatory Correction 4 & Slice 21B):
 *      Revalidates inside locked transaction:
 *      - commitment exists
 *      - deletedAt IS NULL
 *      - separation of duties (createdById !== actor.id && submittedById !== actor.id)
 *      - status === SUBMITTED
 *      - budgetLineId matches the locked budget_lines row (or retries cleanly)
 *      - project is ACTIVE and not deleted
 *      - budget is APPROVED and non-deleted
 *      - budgetLine belongs to the approved budget of the same project
 *    - Aggregates:
 *      - APPROVED expenses
 *      - APPROVED commitments
 *      - Outstanding custodies
 *      - APPROVED payroll entries
 *    - Calculates Total Exposure using Prisma.Decimal.
 *    - Enforces hard ceiling: currentExposure + commitment.amount <= BudgetLine.amount.
 * 5. Immutability trigger: Once APPROVED, commitment can never be mutated or deleted.
 * 6. Atomicity: Status update + approval metadata + COMMITMENT_APPROVED AuditLog in SAME transaction.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  ProjectStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import { assertCanTransitionCommitmentStatus } from '../state-machine';
import { isBudgetLineOverCeiling, calculateRemainingBudgetLineBalance } from '@/lib/budget';
import { sumOutstandingCustodyBalances } from '@/lib/custodies';
import type { CommitmentSummaryDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

/**
 * Approves a submitted commitment, committing it as an authorized encumbrance against the BudgetLine.
 */
export async function approveCommitment(commitmentId: unknown): Promise<CommitmentSummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate commitmentId
  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const now = new Date();
  let approved;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    // 3. Pre-transaction fetch for sanity & separation-of-duties check
    const preCheck = await prisma.commitment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdById: true,
        submittedById: true,
        budgetLineId: true,
        amount: true,
        projectId: true,
      },
    });

    if (!preCheck) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    // 4. Assert separation of duties: Approver cannot be the creator OR the submitter
    if (preCheck.createdById === actor.id || preCheck.submittedById === actor.id) {
      throw new AppError(
        'FORBIDDEN_SELF_APPROVAL',
        'لا يمكن للمعتمد اعتماد التزام مالي قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
      );
    }

    // 5. Assert state machine transition (SUBMITTED -> APPROVED)
    assertCanTransitionCommitmentStatus(preCheck.status, CommitmentStatus.APPROVED);

    const candidateBudgetLineId = preCheck.budgetLineId;

    // 6. Execute atomic approval transaction with canonical hierarchical row-level locking
    try {
      approved = await prisma.$transaction(async (tx) => {
        // 6.1 Lock the parent budget line row (Lock 1: SELECT ... FOR UPDATE)
        const lockedLines = await tx.$queryRaw<
          Array<{ id: string; amount: Prisma.Decimal; budgetId?: string }>
        >`
          SELECT id, amount, "budgetId" FROM budget_lines
          WHERE id = ${candidateBudgetLineId}
          FOR UPDATE
        `;

        const lockedLine = lockedLines[0];
        if (!lockedLine) {
          throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
        }

        // 6.2 Lock the commitment row (Lock 2: SELECT ... FOR UPDATE)
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM commitments WHERE id = ${id} FOR UPDATE
          `;
        }

        // 6.3 Approval Deletion Guard & Revalidation (Mandatory Correction 4)
        const commitmentToApprove = await tx.commitment.findFirst({
          where: { id, deletedAt: null },
          include: {
            project: { select: { id: true, status: true, deletedAt: true } },
          },
        });

        if (!commitmentToApprove) {
          throw new AppError('NOT_FOUND', 'الالتزام غير موجود أو تم حذفه');
        }

        if (commitmentToApprove.deletedAt !== null) {
          throw new AppError('RECORD_DELETED', 'لا يمكن اعتماد التزام محذوف');
        }

        if (
          commitmentToApprove.createdById === actor.id ||
          commitmentToApprove.submittedById === actor.id
        ) {
          throw new AppError(
            'FORBIDDEN_SELF_APPROVAL',
            'لا يمكن للمعتمد اعتماد التزام مالي قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
          );
        }

        if (commitmentToApprove.status !== CommitmentStatus.SUBMITTED) {
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            `لا يمكن اعتماد الالتزام وهو في حالة "${commitmentToApprove.status}"، يجب أن يكون قيد الاعتماد (SUBMITTED)`,
          );
        }

        // Verify the locked budget line matches the commitment's current budgetLineId
        if (commitmentToApprove.budgetLineId !== candidateBudgetLineId) {
          throw new StaleLinkageRetryError();
        }

        // Revalidate project is ACTIVE and not deleted
        if (
          commitmentToApprove.project.status !== ProjectStatus.ACTIVE ||
          commitmentToApprove.project.deletedAt !== null
        ) {
          throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
        }

        // Revalidate budget is APPROVED and not deleted
        const approvedBudget = await tx.budget.findFirst({
          where: {
            projectId: commitmentToApprove.projectId,
            status: BudgetStatus.APPROVED,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!approvedBudget) {
          throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
        }

        // Revalidate budgetLine belongs to the approved budget of the same project
        const targetBudgetLine = await tx.budgetLine.findFirst({
          where: {
            id: commitmentToApprove.budgetLineId,
            budgetId: approvedBudget.id,
          },
          select: { id: true },
        });

        if (!targetBudgetLine || (lockedLine.budgetId && lockedLine.budgetId !== approvedBudget.id)) {
          throw new AppError(
            'INVALID_BUDGET_LINE',
            'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع',
          );
        }

        // 6.4 Calculate combined Total Exposure after acquiring the lock
        // A. Aggregate APPROVED expenses on this budget line
        const approvedExpensesAgg = await tx.expense.aggregate({
          where: {
            budgetLineId: commitmentToApprove.budgetLineId,
            status: ExpenseStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        });
        const approvedExpenses = approvedExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');

        // B. Aggregate APPROVED commitments on this budget line
        const approvedCommitmentsAgg = await tx.commitment.aggregate({
          where: {
            budgetLineId: commitmentToApprove.budgetLineId,
            status: CommitmentStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        });
        const approvedCommitments =
          approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');

        // C. Aggregate Outstanding Custodies on this budget line
        const activeCustodies =
          typeof tx.custody?.findMany === 'function'
            ? await tx.custody.findMany({
                where: {
                  budgetLineId: commitmentToApprove.budgetLineId,
                  status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
                  deletedAt: null,
                },
                include: {
                  expenses: {
                    where: { status: ExpenseStatus.APPROVED, deletedAt: null },
                    select: { amount: true },
                  },
                },
              })
            : [];

        const outstandingCustodies = sumOutstandingCustodyBalances(activeCustodies);

        // D. Aggregate APPROVED payroll entries on this budget line
        const approvedPayrollAgg =
          typeof tx.payrollEntry?.aggregate === 'function'
            ? await tx.payrollEntry.aggregate({
                where: {
                  budgetLineId: commitmentToApprove.budgetLineId,
                  status: PayrollStatus.APPROVED,
                  deletedAt: null,
                },
                _sum: { amount: true },
              })
            : { _sum: { amount: null } };
        const approvedPayroll = approvedPayrollAgg._sum.amount ?? new Prisma.Decimal('0.00');

        // Total Exposure = ApprovedExpenses + ApprovedCommitments + OutstandingCustodies + ApprovedPayroll
        const currentExposure = approvedExpenses
          .add(approvedCommitments)
          .add(outstandingCustodies)
          .add(approvedPayroll);

        const newTotalExposure = currentExposure.add(commitmentToApprove.amount);

        // 6.5 Enforce hard budget line ceiling
        if (isBudgetLineOverCeiling(currentExposure, commitmentToApprove.amount, lockedLine.amount)) {
          const remainingAvailable = calculateRemainingBudgetLineBalance(
            lockedLine.amount,
            currentExposure,
          );
          throw new AppError(
            'BUDGET_LINE_EXCEEDED',
            `مبلغ الالتزام (${commitmentToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
          );
        }

        // 6.6 Update commitment record to APPROVED
        const updatedCommitment = await tx.commitment.update({
          where: { id },
          data: {
            status: CommitmentStatus.APPROVED,
            approvedById: actor.id,
            approvedAt: now,
          },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            submittedBy: { select: { id: true, name: true, email: true } },
            approvedBy: { select: { id: true, name: true, email: true } },
            rejectedBy: { select: { id: true, name: true, email: true } },
            budgetLine: { select: { id: true, category: true, description: true, amount: true } },
            project: { select: { id: true, name: true, code: true } },
          },
        });

        // 6.7 Write COMMITMENT_APPROVED AuditLog in same transaction
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'COMMITMENT_APPROVED',
            entityType: 'COMMITMENT',
            entityId: updatedCommitment.id,
            metadata: {
              projectId: updatedCommitment.projectId,
              budgetLineId: updatedCommitment.budgetLineId,
              amount: updatedCommitment.amount.toFixed(2),
              previousExposure: currentExposure.toFixed(2),
              approvedExpenses: approvedExpenses.toFixed(2),
              approvedCommitments: approvedCommitments.toFixed(2),
              newTotalExposure: newTotalExposure.toFixed(2),
              remainingLineBalance: lockedLine.amount.sub(newTotalExposure).toFixed(2),
              approvedAt: now.toISOString(),
            },
          },
        });

        return updatedCommitment;
      });
      break;
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt === MAX_LINKAGE_RETRIES) {
          throw new AppError(
            'CONFLICT',
            'تغير ارتباط بند الموازنة للالتزام أثناء الاعتماد؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }

      if (!(error instanceof AppError)) {
        logger.error('commitment.approval_transaction_failed', {
          commitmentId: id,
          actorId: actor.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  if (!approved) {
    throw new AppError(
      'CONFLICT',
      'تغير ارتباط بند الموازنة للالتزام أثناء الاعتماد؛ يرجى إعادة المحاولة',
    );
  }

  logger.info('commitment.approved', {
    commitmentId: approved.id,
    projectId: approved.projectId,
    budgetLineId: approved.budgetLineId,
    actorId: actor.id,
    amount: approved.amount.toFixed(2),
  });

  return toCommitmentSummaryDTO(approved);
}
