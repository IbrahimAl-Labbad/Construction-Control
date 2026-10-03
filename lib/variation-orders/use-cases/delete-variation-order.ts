/**
 * lib/variation-orders/use-cases/delete-variation-order.ts
 *
 * Use case: Site Engineer deletes a DRAFT Variation Order.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER only.
 * 2. Status guard: Only DRAFT records can be deleted. Approved or submitted records cannot.
 * 3. Ownership guard: Only the Engineer who created the draft may delete it.
 * 4. Audit trail: Produces VARIATION_ORDER_DELETED AuditLog inside the transaction.
 */

import { Role, VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { variationOrderIdSchema } from '@/lib/validation/schemas/variation-order';

export async function deleteVariationOrder(
  id: unknown,
): Promise<{ success: true; id: string }> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(variationOrderIdSchema, id);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const voId = validation.data;

  const existing = await prisma.variationOrder.findFirst({
    where: {
      id: voId,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      orderNumber: true,
      status: true,
      createdById: true,
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  if (existing.status !== VariationOrderStatus.DRAFT) {
    throw new AppError(
      'RECORD_NOT_EDITABLE',
      'لا يمكن حذف أمر التغيير إلا عندما يكون في حالة مسودة (DRAFT)',
    );
  }

  if (existing.createdById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'غير مصرح: لا يمكن حذف مسودة أمر التغيير إلا بواسطة المهندس الذي أنشأها',
    );
  }

  const correlationId = getCorrelationId();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.variationOrder.update({
      where: { id: existing.id },
      data: { deletedAt: now },
    });

    await tx.auditLog.create({
      data: {
        action: 'VARIATION_ORDER_DELETED',
        entityType: 'VARIATION_ORDER',
        entityId: existing.id,
        actorId: actor.id,
        metadata: {
          projectId: existing.projectId,
          orderNumber: existing.orderNumber,
        },
      },
    });
  });

  logger.info('variation_order.deleted', {
    correlationId,
    variationId: existing.id,
    orderNumber: existing.orderNumber,
    projectId: existing.projectId,
    actorId: actor.id,
    role: actor.role,
  });

  return { success: true, id: existing.id };
}
