/**
 * lib/subcontractor-billings/use-cases/approve-billing.ts
 *
 * Use case: Manager formally approves a submitted Subcontractor Billing claim.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Separation of duties:
 *    - actor.id !== billing.createdById (creator cannot self-approve)
 *    - actor.id !== billing.submittedById (submitter cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Approval Concurrency & Pessimistic Row Locking:
 *    - Executes inside prisma.$transaction.
 *    - Acquires PostgreSQL row-level locks in strict hierarchical order:
 *      budget_lines -> commitments -> subcontractor_billings
 * 5. Revalidations inside locked transaction:
 *    - Billing exists, not deleted, status === SUBMITTED.
 *    - Project is ACTIVE and not deleted.
 *    - Approved budget exists and not deleted.
 *    - BudgetLine belongs to the approved budget of the project.
 *    - Commitment exists, status === APPROVED, belongs to same project + budgetLine.
 * 6. Hard Ceiling Validation:
 *    - SUM(APPROVED billings on this commitment) + billing.grossAmount <= Commitment.amount.
 *    - Uses checkBillingCeiling() from calculations.ts.
 *    - Throws COMMITMENT_CEILING_EXCEEDED if breached.
 * 7. Invariant: Approved billing does NOT modify BudgetLine exposure.
 * 8. Atomicity: Status update + SUBCONTRACTOR_BILLING_APPROVED AuditLog in SAME transaction.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  Prisma,
  ProjectStatus,
  SubcontractorBillingStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { billingIdSchema } from '@/lib/validation/schemas/subcontractor-billing';

import { checkBillingCeiling } from '../calculations';
import { toSubcontractorBillingSummaryDTO } from '../mappers';
import { assertCanTransitionBillingStatus } from '../state-machine';
import type { SubcontractorBillingSummaryDTO } from '../types';

const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function approveBilling(billingId: unknown): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate billingId
  const idValidation = validate(billingIdSchema, billingId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch for sanity & separation-of-duties check
  const preCheck = await prisma.subcontractorBilling.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      createdById: true,
      submittedById: true,
      budgetLineId: true,
      commitmentId: true,
      projectId: true,
      grossAmount: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'المستخلص غير موجود');
  }

  // 4. Assert separation of duties: Approver cannot be the creator OR the submitter
  if (preCheck.createdById === actor.id || preCheck.submittedById === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد اعتماد مستخلص مالي قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
    );
  }

  // 5. Assert state machine transition (SUBMITTED -> APPROVED)
  assertCanTransitionBillingStatus(preCheck.status, SubcontractorBillingStatus.APPROVED);

  // 6. Execute atomic approval transaction with hierarchical row-level locking
  const now = new Date();
  const approved = await prisma.$transaction(async (tx) => {
    // 6.1 Lock parent budget line (Lock 1)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 6.2 Lock parent commitment (Lock 2)
    const lockedCommitments = await tx.$queryRaw<
      Array<{
        id: string;
        amount: Prisma.Decimal;
        status: CommitmentStatus;
        projectId: string;
        budgetLineId: string;
        vendorName: string;
      }>
    >`
      SELECT id, amount, status, "projectId", "budgetLineId", "vendorName"
      FROM commitments
      WHERE id = ${preCheck.commitmentId}
      FOR UPDATE
    `;

    const lockedCommitment = lockedCommitments[0];
    if (!lockedCommitment) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }

    // 6.3 Re-fetch billing inside tx (Lock 3 via re-validation)
    const billingToApprove = await tx.subcontractorBilling.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!billingToApprove) {
      throw new AppError('NOT_FOUND', 'المستخلص غير موجود أو تم حذفه');
    }

    if (billingToApprove.deletedAt !== null) {
      throw new AppError('RECORD_DELETED', 'لا يمكن اعتماد مستخلص محذوف');
    }

    if (billingToApprove.status !== SubcontractorBillingStatus.SUBMITTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن اعتماد المستخلص وهو في حالة "${billingToApprove.status}"، يجب أن يكون قيد الاعتماد (SUBMITTED)`,
      );
    }

    // Revalidate project is ACTIVE and not deleted
    if (
      billingToApprove.project.status !== ProjectStatus.ACTIVE ||
      billingToApprove.project.deletedAt !== null
    ) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    // Revalidate budget is APPROVED and not deleted
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: billingToApprove.projectId,
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
        id: billingToApprove.budgetLineId,
        budgetId: approvedBudget.id,
      },
      select: { id: true },
    });

    if (!targetBudgetLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع');
    }

    // Revalidate commitment is APPROVED and belongs to same project and budgetLine
    if (lockedCommitment.status !== CommitmentStatus.APPROVED) {
      throw new AppError(
        'COMMITMENT_NOT_APPROVED',
        'يجب أن يكون الالتزام المرتبط بالمستخلص معتمداً (APPROVED)',
      );
    }

    if (
      lockedCommitment.projectId !== billingToApprove.projectId ||
      lockedCommitment.budgetLineId !== billingToApprove.budgetLineId
    ) {
      throw new AppError(
        'INVALID_COMMITMENT_LINKAGE',
        'الالتزام المحدد لا يتبع نفس المشروع وبند الموازنة المحدد للمستخلص',
      );
    }

    // 6.4 Aggregate existing APPROVED billings for this commitment
    const approvedBillingsAgg = await tx.subcontractorBilling.aggregate({
      where: {
        commitmentId: billingToApprove.commitmentId,
        status: SubcontractorBillingStatus.APPROVED,
        deletedAt: null,
        id: { not: billingToApprove.id },
      },
      _sum: { grossAmount: true },
    });

    const previousCumulativeCertified =
      approvedBillingsAgg._sum.grossAmount ?? new Prisma.Decimal('0.00');

    // 6.5 Enforce Commitment ceiling
    const ceilingResult = checkBillingCeiling(
      lockedCommitment.amount,
      previousCumulativeCertified,
      billingToApprove.grossAmount,
    );

    if (!ceilingResult.withinCeiling) {
      const remainingAvailable = lockedCommitment.amount.sub(previousCumulativeCertified);
      throw new AppError(
        'COMMITMENT_CEILING_EXCEEDED',
        `مبلغ المستخلص (${billingToApprove.grossAmount.toFixed(2)} ر.س) يتجاوز الرصيد المتبقي للالتزام (${remainingAvailable.toFixed(2)} ر.س)`,
      );
    }

    // 6.6 Update billing record to APPROVED
    const updatedBilling = await tx.subcontractorBilling.update({
      where: { id },
      data: {
        status: SubcontractorBillingStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
      include: BILLING_INCLUDE,
    });

    // 6.7 Write SUBCONTRACTOR_BILLING_APPROVED AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_APPROVED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: updatedBilling.id,
        metadata: {
          projectId: updatedBilling.projectId,
          commitmentId: updatedBilling.commitmentId,
          grossAmount: updatedBilling.grossAmount.toFixed(2),
          previousCumulativeCertified: ceilingResult.previousCumulativeCertified.toFixed(2),
          newCumulativeCertified: ceilingResult.newCumulativeCertified.toFixed(2),
          remainingCommitmentBalance: ceilingResult.remainingCommitmentBalance.toFixed(2),
          approvedAt: now.toISOString(),
        },
      },
    });

    return updatedBilling;
  });

  return toSubcontractorBillingSummaryDTO(approved);
}
