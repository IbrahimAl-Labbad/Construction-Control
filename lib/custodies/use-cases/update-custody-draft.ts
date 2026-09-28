/**
 * lib/custodies/use-cases/update-custody-draft.ts
 *
 * Use case: Creator updates an existing Custody draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: Only the creator can edit their draft.
 * 3. Status guard: Custody must be in DRAFT status.
 * 4. Invariants revalidated:
 *    - Project ACTIVE and not deleted.
 *    - BudgetLine belongs to project approved budget.
 *    - Custodian user active with allowed role.
 *    - Maximum 1 active custody per custodian per project.
 * 5. Atomicity: Update + CUSTODY_UPDATED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, Prisma, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import {
  updateCustodyDraftSchema,
  type UpdateCustodyDraftInput,
} from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import type { CustodySummaryDTO } from '../types';

export async function updateCustodyDraft(
  input: UpdateCustodyDraftInput,
): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT
  const actor = await requireRole([Role.ENGINEER, Role.ACCOUNTANT]);

  // 2. Validate input
  const validation = validate(updateCustodyDraftSchema, input);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const data = validation.data;

  // 3. Execute atomic transaction to verify invariants and update draft
  const updated = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch existing custody draft
    const existing = await tx.custody.findFirst({
      where: { id: data.id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
    }

    // 3.2 Verify ownership
    if (existing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تعديل مسودة عهدة قام مستخدم آخر بإنشائها');
    }

    // 3.2.1 For Site Engineers: verify active project assignment (Slice 14 / BD-14-03)
    if (actor.role === Role.ENGINEER) {
      const isClaimantAssigned = await isEngineerAssignedToProject(existing.projectId, actor.id);
      if (!isClaimantAssigned) {
        throw new AppError(
          'FORBIDDEN',
          'لا يمكنك تعديل مسودة عهدة لمشروع لست معيناً ضمن فريقه الهندسي',
        );
      }
    }

    // 3.3 Verify DRAFT status
    if (existing.status !== CustodyStatus.DRAFT) {
      throw new AppError(
        'CUSTODY_NOT_DRAFT',
        `لا يمكن تعديل العهدة وهي في حالة "${existing.status}"، يجب أن تكون في حالة مسودة (DRAFT)`,
      );
    }

    // 3.4 Verify project is active and not deleted
    if (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    // 3.5 Verify approved budget exists
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: existing.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 3.6 Verify budgetLine belongs to approved budget
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

    // 3.7 Verify custodian user
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

    // 3.7.1 For Engineer custodians: verify active project assignment (Slice 14 / BD-14-03)
    if (custodian.role === Role.ENGINEER) {
      const isCustodianAssigned = await isEngineerAssignedToProject(existing.projectId, custodian.id);
      if (!isCustodianAssigned) {
        throw new ValidationError([
          { path: 'custodianUserId', message: 'أمين العهدة المحدد ليس معيناً ضمن الفريق الهندسي للمشروع' },
        ]);
      }
    }

    // 3.8 Check active custody invariant if custodian changed
    if (existing.custodianUserId !== data.custodianUserId) {
      const activeCustody = await tx.custody.findFirst({
        where: {
          id: { not: existing.id },
          projectId: existing.projectId,
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
    }

    const newAmount = new Prisma.Decimal(data.amount);

    // 3.9 Update draft record
    const custody = await tx.custody.update({
      where: { id: data.id },
      data: {
        budgetLineId: data.budgetLineId,
        custodianUserId: data.custodianUserId,
        amount: newAmount,
        purpose: data.purpose,
        expectedSettlementDate: data.expectedSettlementDate ?? null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 3.10 Write CUSTODY_UPDATED audit log with field deltas
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_UPDATED',
        entityType: 'CUSTODY',
        entityId: custody.id,
        metadata: {
          code: custody.code,
          previous: {
            budgetLineId: existing.budgetLineId,
            custodianUserId: existing.custodianUserId,
            amount: existing.amount.toFixed(2),
            purpose: existing.purpose,
          },
          updated: {
            budgetLineId: custody.budgetLineId,
            custodianUserId: custody.custodianUserId,
            amount: custody.amount.toFixed(2),
            purpose: custody.purpose,
          },
        },
      },
    });

    return custody;
  });

  return toCustodySummaryDTO(updated);
}
