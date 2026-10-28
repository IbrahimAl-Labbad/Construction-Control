/**
 * lib/variation-orders/use-cases/submit-variation-order.ts
 *
 * Use case: Site Engineer submits a DRAFT Variation Order for Manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER only.
 * 2. Ownership guard: Submitter must be the creator.
 * 3. State machine: DRAFT -> SUBMITTED.
 * 4. Concurrency & Row Locking:
 *    - Acquires pessimistic FOR UPDATE lock following canonical lock hierarchy.
 *    - Revalidates draft status, ownership, and non-deleted state inside locked transaction.
 *    - Uses Stale-Linkage Retry pattern if linkages shift.
 * 5. Lock transition: Record becomes locked against modifications while SUBMITTED.
 * 6. Audit trail: Appends VARIATION_ORDER_SUBMITTED in the transaction.
 */

import { ProjectStatus, Role, VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { submitVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import { assertCanTransitionVariationOrderStatus } from '../state-machine';
import type { VariationOrderDetailDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

export async function submitVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(submitVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  const correlationId = getCorrelationId();
  const now = new Date();
  let submitted;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    const preCheck = await prisma.variationOrder.findFirst({
      where: {
        id: input.id,
        deletedAt: null,
      },
      select: {
        id: true,
        projectId: true,
        orderNumber: true,
        status: true,
        createdById: true,
        impactAmount: true,
        budgetLineId: true,
        commitmentId: true,
      },
    });

    if (!preCheck) {
      throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
    }

    // Ownership guard
    if (preCheck.createdById !== actor.id) {
      throw new AppError(
        'FORBIDDEN',
        'غير مصرح: لا يمكن تقديم أمر التغيير للاعتماد إلا بواسطة المهندس الذي أنشأه',
      );
    }

    // State machine transition: DRAFT -> SUBMITTED
    assertCanTransitionVariationOrderStatus(
      preCheck.status,
      VariationOrderStatus.SUBMITTED,
    );

    try {
      submitted = await prisma.$transaction(async (tx) => {
        if (typeof tx.$queryRaw === 'function') {
          // Lock Level 1: budget_lines (if linked)
          if (preCheck.budgetLineId) {
            await tx.$queryRaw`
              SELECT id FROM budget_lines WHERE id = ${preCheck.budgetLineId} FOR UPDATE
            `;
          }

          // Lock Level 2: commitments (if linked)
          if (preCheck.commitmentId) {
            await tx.$queryRaw`
              SELECT id FROM commitments WHERE id = ${preCheck.commitmentId} FOR UPDATE
            `;
          }

          // Lock Level 3: variation_orders
          await tx.$queryRaw`
            SELECT id, status, "createdById", "projectId", "deletedAt", "budgetLineId", "commitmentId", "impactAmount", "orderNumber"
            FROM variation_orders
            WHERE id = ${input.id}
            FOR UPDATE
          `;
        }

        const lockedVO = await tx.variationOrder.findFirst({
          where: { id: input.id },
          select: {
            id: true,
            status: true,
            createdById: true,
            projectId: true,
            deletedAt: true,
            budgetLineId: true,
            commitmentId: true,
            orderNumber: true,
            impactAmount: true,
          },
        });

        if (!lockedVO || lockedVO.deletedAt !== null) {
          throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود أو تم حذفه');
        }

        // Stale linkage check
        if (
          lockedVO.budgetLineId !== preCheck.budgetLineId ||
          lockedVO.commitmentId !== preCheck.commitmentId
        ) {
          throw new StaleLinkageRetryError();
        }

        // Revalidate ownership under lock
        if (lockedVO.createdById !== actor.id) {
          throw new AppError(
            'FORBIDDEN',
            'غير مصرح: لا يمكن تقديم أمر التغيير للاعتماد إلا بواسطة المهندس الذي أنشأه',
          );
        }

        // Revalidate state machine transition under lock
        assertCanTransitionVariationOrderStatus(
          lockedVO.status,
          VariationOrderStatus.SUBMITTED,
        );

        // Verify project validity
        const project = await tx.project.findFirst({
          where: { id: lockedVO.projectId, deletedAt: null },
          select: { status: true },
        });

        if (!project || project.status === ProjectStatus.CANCELLED) {
          throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن تقديم أمر تغيير لمشروع ملغي أو محذوف');
        }

        const vo = await tx.variationOrder.update({
          where: { id: lockedVO.id },
          data: {
            status: VariationOrderStatus.SUBMITTED,
            submittedById: actor.id,
            submittedAt: now,
          },
          include: VARIATION_ORDER_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            action: 'VARIATION_ORDER_SUBMITTED',
            entityType: 'VARIATION_ORDER',
            entityId: vo.id,
            actorId: actor.id,
            metadata: {
              projectId: vo.projectId,
              orderNumber: vo.orderNumber,
              impactAmount: vo.impactAmount.toFixed(2),
            },
          },
        });

        return vo;
      });
      break;
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt === MAX_LINKAGE_RETRIES) {
          throw new AppError(
            'CONFLICT',
            'تغيرت بيانات الارتباط لأمر التغيير أثناء التقديم؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }
      throw error;
    }
  }

  if (!submitted) {
    throw new AppError(
      'CONFLICT',
      'تغيرت بيانات الارتباط لأمر التغيير أثناء التقديم؛ يرجى إعادة المحاولة',
    );
  }

  logger.info('variation_order.submitted', {
    correlationId,
    variationId: submitted.id,
    orderNumber: submitted.orderNumber,
    projectId: submitted.projectId,
    actorId: actor.id,
    role: actor.role,
    impactAmount: submitted.impactAmount.toFixed(2),
  });

  return toVariationOrderDetailDTO(submitted as unknown as VariationOrderQueryRow);
}
