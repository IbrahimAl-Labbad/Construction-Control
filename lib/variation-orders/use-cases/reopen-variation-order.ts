/**
 * lib/variation-orders/use-cases/reopen-variation-order.ts
 *
 * Use case: Site Engineer reopens a REJECTED Variation Order back to DRAFT.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER only.
 * 2. Ownership guard: Only the Engineer who created the variation order can reopen it.
 * 3. State machine transition: REJECTED -> DRAFT.
 * 4. Audit trail: Appends VARIATION_ORDER_REOPENED in transaction.
 * 5. Structured observability logging.
 */

import { Role, VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { reopenVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import { assertCanTransitionVariationOrderStatus } from '../state-machine';
import type { VariationOrderDetailDTO } from '../types';

export async function reopenVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(reopenVariationOrderSchema, rawInput);
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
      rejectionReason: true,
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  // Ownership guard
  if (existing.createdById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'غير مصرح: لا يمكن إعادة فتح أمر التغيير إلا بواسطة المهندس الذي أنشأه',
    );
  }

  // State machine transition: REJECTED -> DRAFT
  assertCanTransitionVariationOrderStatus(
    existing.status,
    VariationOrderStatus.DRAFT,
  );

  const correlationId = getCorrelationId();

  const reopened = await prisma.$transaction(async (tx) => {
    const vo = await tx.variationOrder.update({
      where: { id: existing.id },
      data: {
        status: VariationOrderStatus.DRAFT,
        // Preserve prior rejection reason in history/audit, but clear rejection tracking on active draft
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: VARIATION_ORDER_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        action: 'VARIATION_ORDER_REOPENED',
        entityType: 'VARIATION_ORDER',
        entityId: vo.id,
        actorId: actor.id,
        metadata: {
          projectId: vo.projectId,
          orderNumber: vo.orderNumber,
          previousRejectionReason: existing.rejectionReason,
        },
      },
    });

    return vo;
  });

  logger.info('variation_order.reopened', {
    correlationId,
    variationId: reopened.id,
    orderNumber: reopened.orderNumber,
    projectId: reopened.projectId,
    actorId: actor.id,
    role: actor.role,
  });

  return toVariationOrderDetailDTO(reopened as unknown as VariationOrderQueryRow);
}
