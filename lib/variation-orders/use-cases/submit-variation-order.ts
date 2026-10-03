/**
 * lib/variation-orders/use-cases/submit-variation-order.ts
 *
 * Use case: Site Engineer submits a DRAFT Variation Order for Manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER only.
 * 2. Ownership guard: Submitter must be the creator.
 * 3. State machine: DRAFT -> SUBMITTED.
 * 4. Lock transition: Record becomes locked against modifications while SUBMITTED.
 * 5. Audit trail: Appends VARIATION_ORDER_SUBMITTED in the transaction.
 */

import { Role, VariationOrderStatus } from '@prisma/client';
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

export async function submitVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(submitVariationOrderSchema, rawInput);
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
      impactAmount: true,
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  // Ownership guard
  if (existing.createdById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'غير مصرح: لا يمكن تقديم أمر التغيير للاعتماد إلا بواسطة المهندس الذي أنشأه',
    );
  }

  // State machine transition: DRAFT -> SUBMITTED
  assertCanTransitionVariationOrderStatus(
    existing.status,
    VariationOrderStatus.SUBMITTED,
  );

  const correlationId = getCorrelationId();
  const now = new Date();

  const submitted = await prisma.$transaction(async (tx) => {
    const vo = await tx.variationOrder.update({
      where: { id: existing.id },
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
