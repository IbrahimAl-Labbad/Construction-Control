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
 *    - Acquires PostgreSQL row-level lock: SELECT id, amount FROM budget_lines WHERE id = ... FOR UPDATE.
 *    - Approval Deletion Guard (Mandatory Correction 4):
 *      Revalidates inside locked transaction:
 *      - commitment exists
 *      - deletedAt IS NULL
 *      - status === SUBMITTED
 *      - project is ACTIVE and not deleted
 *      - budget is APPROVED and non-deleted
 *      - budgetLine belongs to the approved budget of the same project
 *    - Aggregates BOTH:
 *      - APPROVED expenses
 *      - APPROVED commitments
 *    - Calculates Total Exposure using Prisma.Decimal.
 *    - Enforces hard ceiling: currentExposure + commitment.amount <= BudgetLine.amount.
 * 5. Immutability trigger: Once APPROVED, commitment can never be mutated or deleted.
 * 6. Atomicity: Status update + approval metadata + COMMITMENT_APPROVED AuditLog in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, ExpenseStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import { assertCanTransitionCommitmentStatus } from '../state-machine';
import type { CommitmentSummaryDTO } from '../types';

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

  // 6. Execute atomic approval transaction with BudgetLine row-level locking
  const now = new Date();
  const approved = await prisma.$transaction(async (tx) => {
    // 6.1 Lock the parent budget line row (SELECT ... FOR UPDATE)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 6.2 Approval Deletion Guard & Revalidation (Mandatory Correction 4)
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

    if (commitmentToApprove.status !== CommitmentStatus.SUBMITTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن اعتماد الالتزام وهو في حالة "${commitmentToApprove.status}"، يجب أن يكون قيد الاعتماد (SUBMITTED)`,
      );
    }

    // Revalidate project is ACTIVE and not deleted
    if (commitmentToApprove.project.status !== ProjectStatus.ACTIVE || commitmentToApprove.project.deletedAt !== null) {
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

    if (!targetBudgetLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع');
    }

    // 6.3 Calculate combined Total Exposure after acquiring the lock
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
    const approvedCommitments = approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');

    // Total Exposure = ApprovedExpenses + ApprovedCommitments
    const currentExposure = approvedExpenses.add(approvedCommitments);
    const newTotalExposure = currentExposure.add(commitmentToApprove.amount);

    // 6.4 Enforce hard budget line ceiling
    if (newTotalExposure.greaterThan(lockedLine.amount)) {
      const remainingAvailable = lockedLine.amount.sub(currentExposure);
      throw new AppError(
        'BUDGET_LINE_EXCEEDED',
        `مبلغ الالتزام (${commitmentToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
      );
    }

    // 6.5 Update commitment record to APPROVED
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

    // 6.6 Write COMMITMENT_APPROVED AuditLog in same transaction
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

  return toCommitmentSummaryDTO(approved);
}
