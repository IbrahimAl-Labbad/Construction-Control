/**
 * lib/variation-orders/use-cases/reject-variation-order.ts
 *
 * Use case: Manager formally rejects a submitted Variation Order.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Mandatory reason: Rejection reason must be at least 3 characters.
 * 3. State machine transition: SUBMITTED -> REJECTED.
 * 4. Audit trail: Appends VARIATION_ORDER_REJECTED in transaction with reason.
 * 5. Structured observability logging.
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

export async function rejectVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireManager();

  const validation = validate(rejectVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  const existing = await prisma.variationOrder.findFirst({
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
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  // State machine transition: SUBMITTED -> REJECTED
  assertCanTransitionVariationOrderStatus(
    existing.status,
    VariationOrderStatus.REJECTED,
  );

  const correlationId = getCorrelationId();
  const now = new Date();

  const rejected = await prisma.$transaction(async (tx) => {
    const vo = await tx.variationOrder.update({
      where: { id: existing.id },
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
