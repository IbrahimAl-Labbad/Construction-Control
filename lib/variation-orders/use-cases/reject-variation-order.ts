/**
 * lib/variation-orders/use-cases/reject-variation-order.ts
 *
 * Use case: Manager formally rejects a submitted Variation Order.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Mandatory reason: Rejection reason must be at least 3 characters.
 * 3. State machine transition: SUBMITTED -> REJECTED.
 * 4. Concurrency & Canonical Row Locking:
 *    - Acquires FOR UPDATE lock in canonical hierarchy: budget_lines -> commitments -> variation_orders.
 *    - Revalidates locked record status === SUBMITTED and non-deleted inside transaction.
 *    - Stale-Linkage Retry loop (MAX_LINKAGE_RETRIES = 3).
 * 5. Audit trail: Appends VARIATION_ORDER_REJECTED in transaction with reason.
 * 6. Structured observability logging.
 */

import { VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { rejectVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
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

export async function rejectVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireManager();

  const validation = validate(rejectVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  const correlationId = getCorrelationId();
  const now = new Date();
  let rejected;

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
        submittedById: true,
        impactAmount: true,
        budgetLineId: true,
        commitmentId: true,
      },
    });

    if (!preCheck) {
      throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
    }

    // State machine transition: SUBMITTED -> REJECTED
    assertCanTransitionVariationOrderStatus(
      preCheck.status,
      VariationOrderStatus.REJECTED,
    );

    try {
      rejected = await prisma.$transaction(async (tx) => {
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
            SELECT id, status, "createdById", "submittedById", "budgetLineId", "commitmentId", "deletedAt", "projectId", "orderNumber"
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
            submittedById: true,
            budgetLineId: true,
            commitmentId: true,
            deletedAt: true,
            projectId: true,
            orderNumber: true,
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

        // Revalidate state machine transition under lock
        assertCanTransitionVariationOrderStatus(
          lockedVO.status,
          VariationOrderStatus.REJECTED,
        );

        const vo = await tx.variationOrder.update({
          where: { id: lockedVO.id },
          data: {
            status: VariationOrderStatus.REJECTED,
            rejectedById: actor.id,
            rejectedAt: now,
            rejectionReason: input.rejectionReason,
          },
          include: VARIATION_ORDER_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            action: 'VARIATION_ORDER_REJECTED',
            entityType: 'VARIATION_ORDER',
            entityId: vo.id,
            actorId: actor.id,
            metadata: {
              projectId: vo.projectId,
              orderNumber: vo.orderNumber,
              rejectionReason: input.rejectionReason,
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
            'تغيرت بيانات الارتباط لأمر التغيير أثناء الرفض؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }
      throw error;
    }
  }

  if (!rejected) {
    throw new AppError(
      'CONFLICT',
      'تغيرت بيانات الارتباط لأمر التغيير أثناء الرفض؛ يرجى إعادة المحاولة',
    );
  }

  logger.info('variation_order.rejected', {
    correlationId,
    variationId: rejected.id,
    orderNumber: rejected.orderNumber,
    projectId: rejected.projectId,
    actorId: actor.id,
    role: actor.role,
    reason: input.rejectionReason,
  });

  return toVariationOrderDetailDTO(rejected as unknown as VariationOrderQueryRow);
}
