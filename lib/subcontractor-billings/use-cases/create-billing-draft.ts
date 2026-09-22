/**
 * lib/subcontractor-billings/use-cases/create-billing-draft.ts
 *
 * Use case: Accountant creates a new Subcontractor Billing draft.
 *
 * Enforces:
 * 1. Authorization: Role.ACCOUNTANT only (policies.canCreateBilling).
 * 2. Zod validation via createBillingDraftSchema.
 * 3. Invariants (all inside a single transaction):
 *    - Project must exist, be ACTIVE, and not deleted.
 *    - An APPROVED budget must exist for the project.
 *    - budgetLine must belong to the approved budget.
 *    - commitment must exist, be APPROVED, not deleted.
 *    - commitment.projectId === billing.projectId
 *    - commitment.budgetLineId === billing.budgetLineId
 *    - subcontractorName must equal commitment.vendorName
 *      (trimmed, case-insensitive — Decision #24).
 * 4. Does NOT create an Expense, modify BudgetLine exposure,
 *    or reduce the Commitment amount.
 * 5. Atomicity: Draft creation + SUBCONTRACTOR_BILLING_CREATED AuditLog
 *    in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import {
  createBillingDraftSchema,
  type CreateBillingDraftInput,
} from '@/lib/validation/schemas/subcontractor-billing';

import { toSubcontractorBillingSummaryDTO } from '../mappers';
import type { SubcontractorBillingSummaryDTO } from '../types';

/** Standard include shape for billing queries — used across all use-cases. */
const BILLING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  budgetLine: { select: { id: true, category: true, description: true, amount: true } },
  commitment: { select: { id: true, vendorName: true, amount: true, referenceNumber: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

export async function createBillingDraft(
  input: CreateBillingDraftInput,
): Promise<SubcontractorBillingSummaryDTO> {
  // 1. Authentication + coarse role authorization
  const actor = await requireAuth();
  if (!policies.canCreateBilling(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإنشاء مستخلص مقاول باطن');
  }

  // 2. Validate input
  const validation = validate(createBillingDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  // 3. Atomic transaction: verify invariants and create draft
  const billing = await prisma.$transaction(async (tx) => {
    // 3.1 Project must exist, be ACTIVE, and not deleted
    const project = await tx.project.findFirst({
      where: { id: data.projectId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }
    if (project.status !== ProjectStatus.ACTIVE) {
      throw new AppError(
        'INVALID_PROJECT_STATUS',
        `لا يمكن إنشاء مستخلص لمشروع غير نشط (حالة المشروع: ${project.status})`,
      );
    }

    // 3.2 Approved budget must exist
    const approvedBudget = await tx.budget.findFirst({
      where: { projectId: data.projectId, status: BudgetStatus.APPROVED, deletedAt: null },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 3.3 BudgetLine must belong to the approved budget
    const budgetLine = await tx.budgetLine.findFirst({
      where: { id: data.budgetLineId, budgetId: approvedBudget.id },
      select: { id: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة غير موجود أو لا يتبع للموازنة المعتمدة للمشروع',
      );
    }

    // 3.4 Commitment must exist, be APPROVED, not deleted
    const commitment = await tx.commitment.findFirst({
      where: { id: data.commitmentId, deletedAt: null },
      select: {
        id: true,
        status: true,
        projectId: true,
        budgetLineId: true,
        vendorName: true,
      },
    });

    if (!commitment) {
      throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
    }
    if (commitment.status !== CommitmentStatus.APPROVED) {
      throw new AppError(
        'COMMITMENT_NOT_APPROVED',
        'يجب أن يكون الالتزام المرتبط بالمستخلص معتمداً (APPROVED)',
      );
    }

    // 3.5 Commitment linkage: projectId and budgetLineId must match
    if (commitment.projectId !== data.projectId || commitment.budgetLineId !== data.budgetLineId) {
      throw new AppError(
        'INVALID_COMMITMENT_LINKAGE',
        'الالتزام المحدد لا يتبع نفس المشروع وبند الموازنة المحدد للمستخلص',
      );
    }

    // 3.6 subcontractorName must equal commitment.vendorName (Decision #24)
    const normalizedBillingName = data.subcontractorName.trim().toLowerCase();
    const normalizedVendorName = commitment.vendorName.trim().toLowerCase();
    if (normalizedBillingName !== normalizedVendorName) {
      throw new AppError(
        'SUBCONTRACTOR_NAME_MISMATCH',
        `اسم مقاول الباطن "${data.subcontractorName}" لا يطابق اسم المورد في الالتزام "${commitment.vendorName}"`,
      );
    }

    // 3.7 Create billing draft
    const newBilling = await tx.subcontractorBilling.create({
      data: {
        projectId: data.projectId,
        budgetLineId: data.budgetLineId,
        commitmentId: data.commitmentId,
        subcontractorName: data.subcontractorName.trim(),
        referenceNumber: data.referenceNumber ?? null,
        billingPeriod: data.billingPeriod,
        claimDate: data.claimDate,
        grossAmount: new Prisma.Decimal(data.grossAmount),
        currency: 'SAR',
        description: data.description,
        // status defaults to DRAFT
        createdById: actor.id,
      },
      include: BILLING_INCLUDE,
    });

    // 3.8 Write AuditLog in same transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'SUBCONTRACTOR_BILLING_CREATED',
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: newBilling.id,
        metadata: {
          projectId: newBilling.projectId,
          budgetLineId: newBilling.budgetLineId,
          commitmentId: newBilling.commitmentId,
          subcontractorName: newBilling.subcontractorName,
          grossAmount: newBilling.grossAmount.toFixed(2),
          billingPeriod: newBilling.billingPeriod,
          referenceNumber: newBilling.referenceNumber,
          createdAt: newBilling.createdAt.toISOString(),
        },
      },
    });

    return newBilling;
  });

  return toSubcontractorBillingSummaryDTO(billing);
}
