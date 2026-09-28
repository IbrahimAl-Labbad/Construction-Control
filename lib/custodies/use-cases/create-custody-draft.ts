/**
 * lib/custodies/use-cases/create-custody-draft.ts
 *
 * Use case: Engineer or Accountant creates a new Custody advance draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Zod validation of inputs.
 * 3. Invariants:
 *    - Target project must exist, be ACTIVE, and not deleted.
 *    - Target project must have an active APPROVED budget (not deleted).
 *    - BudgetLine must exist and belong to the project's approved budget.
 *    - Custodian user must exist, be active, not deleted, and have Role.ENGINEER or Role.ACCOUNTANT.
 *    - Invariant 8: Maximum 1 active/unsettled custody per custodian per project.
 * 4. Atomicity: Draft creation + CUSTODY_CREATED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import {
  createCustodyDraftSchema,
  type CreateCustodyDraftInput,
} from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import type { CustodySummaryDTO } from '../types';

export async function createCustodyDraft(
  input: CreateCustodyDraftInput,
): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT
  const actor = await requireRole([Role.ENGINEER, Role.ACCOUNTANT]);

  // 2. Validate input
  const validation = validate(createCustodyDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  // 3. Execute atomic transaction to verify invariants and create draft
  const custody = await prisma.$transaction(async (tx) => {
    // 3.1 Verify project exists, is ACTIVE, and not deleted
    const project = await tx.project.findFirst({
      where: { id: data.projectId, deletedAt: null },
      select: { id: true, status: true, code: true, name: true },
    });

    if (!project) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }

    if (project.status !== ProjectStatus.ACTIVE) {
      throw new AppError(
        'INVALID_PROJECT_STATUS',
        `لا يمكن إنشاء عهدة لمشروع غير نشط (حالة المشروع الحالية: ${project.status})`,
      );
    }

    // 3.1.1 For Site Engineers: verify active project assignment (Slice 14 / BD-14-03)
    if (actor.role === Role.ENGINEER) {
      const isClaimantAssigned = await isEngineerAssignedToProject(data.projectId, actor.id);
      if (!isClaimantAssigned) {
        throw new AppError(
          'FORBIDDEN',
          'لا يمكنك طلب عهدة نقدية لمشروع لست معيناً ضمن فريقه الهندسي',
        );
      }
    }

    // 3.2 Verify active approved budget exists for project
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: data.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError(
        'BUDGET_NOT_APPROVED',
        'المشروع لا يمتلك موازنة معتمدة نشطة لإصدار عهدة عليها',
      );
    }

    // 3.3 Verify budget line exists under approved budget
    const budgetLine = await tx.budgetLine.findFirst({
      where: {
        id: data.budgetLineId,
        budgetId: approvedBudget.id,
      },
      select: { id: true, category: true, description: true, amount: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة غير موجود أو لا ينتمي للموازنة المعتمدة لهذا المشروع',
      );
    }

    // 3.4 Verify custodian user exists, is active, and is ENGINEER or ACCOUNTANT
    const custodian = await tx.user.findFirst({
      where: {
        id: data.custodianUserId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, role: true, email: true },
    });

    if (!custodian) {
      throw new AppError('INVALID_CUSTODIAN', 'أمين العهدة غير موجود أو حسابه غير نشط');
    }

    if (custodian.role !== Role.ENGINEER && custodian.role !== Role.ACCOUNTANT) {
      throw new AppError(
        'INVALID_CUSTODIAN',
        'أمين العهدة يجب أن يكون مهندساً ميدانياً أو محاسباً فقط',
      );
    }

    // 3.4.1 For Engineer custodians: verify active project assignment (Slice 14 / BD-14-03)
    if (custodian.role === Role.ENGINEER) {
      const isCustodianAssigned = await isEngineerAssignedToProject(data.projectId, custodian.id);
      if (!isCustodianAssigned) {
        throw new ValidationError([
          { path: 'custodianUserId', message: 'أمين العهدة المحدد ليس معيناً ضمن الفريق الهندسي للمشروع' },
        ]);
      }
    }

    // 3.5 Invariant 8: Check if custodian already has an active/unsettled custody on this project
    const activeCustody = await tx.custody.findFirst({
      where: {
        projectId: data.projectId,
        custodianUserId: data.custodianUserId,
        status: {
          in: [
            CustodyStatus.SUBMITTED,
            CustodyStatus.APPROVED,
            CustodyStatus.ISSUED,
            CustodyStatus.PARTIALLY_SETTLED,
          ],
        },
        deletedAt: null,
      },
      select: { id: true, code: true, status: true },
    });

    if (activeCustody) {
      throw new AppError(
        'ACTIVE_CUSTODY_EXISTS',
        `يوجد بالفعل عهدة نشطة للموظف (${activeCustody.code}) بحالة "${activeCustody.status}" على نفس المشروع. يجب تصفيتها أولاً.`,
      );
    }

    // 3.6 Generate human-readable custody tracking code
    const custodyCount = await tx.custody.count({
      where: { projectId: data.projectId },
    });
    const code = `CUST-${project.code}-${String(custodyCount + 1).padStart(3, '0')}`;

    const amountDecimal = new Prisma.Decimal(data.amount);

    // 3.7 Create Custody draft
    const created = await tx.custody.create({
      data: {
        code,
        projectId: data.projectId,
        budgetLineId: data.budgetLineId,
        custodianUserId: data.custodianUserId,
        amount: amountDecimal,
        purpose: data.purpose,
        status: CustodyStatus.DRAFT,
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        createdById: actor.id,
        expectedSettlementDate: data.expectedSettlementDate ?? null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 3.8 Write CUSTODY_CREATED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_CREATED',
        entityType: 'CUSTODY',
        entityId: created.id,
        metadata: {
          code: created.code,
          projectId: created.projectId,
          budgetLineId: created.budgetLineId,
          custodianUserId: created.custodianUserId,
          amount: created.amount.toFixed(2),
          purpose: created.purpose,
          expectedSettlementDate: created.expectedSettlementDate?.toISOString() ?? null,
        },
      },
    });

    return created;
  });

  return toCustodySummaryDTO(custody);
}
