/**
 * lib/variation-orders/use-cases/update-variation-order.ts
 *
 * Use case: Site Engineer updates an existing Variation Order draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER only.
 * 2. Status guard: Record must be in DRAFT status. Non-drafts cannot be edited.
 * 3. Ownership guard: Only the Engineer who created the draft may edit it.
 * 4. Recalculation: All line item deltas and total impact amount recalculated server-side.
 * 5. Atomicity: Header update + line replacement + AuditLog in single transaction.
 */

import { BudgetStatus, CommitmentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { updateVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { calculateLineFinancialDelta, calculateVariationOrderTotalImpact } from '../calculations';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import { isVariationOrderEditable } from '../state-machine';
import type { VariationOrderDetailDTO } from '../types';

export async function updateVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(updateVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  // Fetch current record
  const existing = await prisma.variationOrder.findFirst({
    where: {
      id: input.id,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdById: true,
      orderNumber: true,
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  // Check state machine: only DRAFT is editable
  if (!isVariationOrderEditable(existing.status)) {
    throw new AppError(
      'RECORD_NOT_EDITABLE',
      'لا يمكن تعديل أمر التغيير إلا عندما يكون في حالة مسودة (DRAFT)',
    );
  }

  // Object-level authorization: owner only
  if (existing.createdById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'غير مصرح: لا يمكن تعديل مسودة أمر التغيير إلا بواسطة المهندس الذي أنشأها',
    );
  }

  // Verify BudgetLine if provided
  if (input.budgetLineId) {
    const budgetLine = await prisma.budgetLine.findFirst({
      where: {
        id: input.budgetLineId,
        budget: {
          projectId: existing.projectId,
          status: BudgetStatus.APPROVED,
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    if (!budgetLine) {
      throw new AppError(
        'INVALID_BUDGET_LINE',
        'بند الموازنة المحدد غير صالح أو لا يتبع للموازنة المعتمدة لهذا المشروع',
      );
    }
  }

  // Verify Commitment if provided
  if (input.commitmentId) {
    const commitment = await prisma.commitment.findFirst({
      where: {
        id: input.commitmentId,
        projectId: existing.projectId,
        deletedAt: null,
        ...(input.budgetLineId ? { budgetLineId: input.budgetLineId } : {}),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!commitment || commitment.status !== CommitmentStatus.APPROVED) {
      throw new AppError(
        'INVALID_COMMITMENT_LINKAGE',
        'الارتباط التعاقدي المحدد غير موجود أو غير معتمد',
      );
    }
  }

  // Process Line Items
  const linesData: Array<{
    description: string;
    unit: string;
    originalQuantity: Prisma.Decimal;
    revisedQuantity: Prisma.Decimal;
    quantityDelta: Prisma.Decimal;
    originalRate: Prisma.Decimal;
    revisedRate: Prisma.Decimal;
    financialDelta: Prisma.Decimal;
    notes: string | null;
  }> = [];

  let totalImpactAmount: Prisma.Decimal;

  if (input.lines && input.lines.length > 0) {
    for (const l of input.lines) {
      const origQty = new Prisma.Decimal(l.originalQuantity);
      const revQty = new Prisma.Decimal(l.revisedQuantity);
      const origRate = new Prisma.Decimal(l.originalRate);
      const revRate = new Prisma.Decimal(l.revisedRate);

      const lineCalc = calculateLineFinancialDelta(origQty, revQty, origRate, revRate);

      linesData.push({
        description: l.description,
        unit: l.unit,
        originalQuantity: lineCalc.originalQuantity,
        revisedQuantity: lineCalc.revisedQuantity,
        quantityDelta: lineCalc.quantityDelta,
        originalRate: lineCalc.originalRate,
        revisedRate: lineCalc.revisedRate,
        financialDelta: lineCalc.financialDelta,
        notes: l.notes ?? null,
      });
    }

    totalImpactAmount = calculateVariationOrderTotalImpact(linesData);
  } else {
    if (input.impactAmount === undefined) {
      throw new AppError(
        'VALIDATION_ERROR',
        'يجب تحديد مبلغ الأثر المالي أو إدخال بنود كميات مفصلة لأمر التغيير',
      );
    }
    totalImpactAmount = new Prisma.Decimal(input.impactAmount);
  }

  const correlationId = getCorrelationId();

  const updated = await prisma.$transaction(async (tx) => {
    // Delete existing lines
    await tx.variationOrderLine.deleteMany({
      where: { variationOrderId: existing.id },
    });

    // Update header and insert new lines
    const vo = await tx.variationOrder.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        reason: input.reason,
        scopeImpact: input.scopeImpact ?? null,
        budgetLineId: input.budgetLineId ?? null,
        commitmentId: input.commitmentId ?? null,
        impactAmount: totalImpactAmount,
        lines: {
          create: linesData.map((l) => ({
            description: l.description,
            unit: l.unit,
            originalQuantity: l.originalQuantity,
            revisedQuantity: l.revisedQuantity,
            quantityDelta: l.quantityDelta,
            originalRate: l.originalRate,
            revisedRate: l.revisedRate,
            financialDelta: l.financialDelta,
            notes: l.notes,
          })),
        },
      },
      include: VARIATION_ORDER_INCLUDE,
    });

    // Write AuditLog
    await tx.auditLog.create({
      data: {
        action: 'VARIATION_ORDER_UPDATED',
        entityType: 'VARIATION_ORDER',
        entityId: vo.id,
        actorId: actor.id,
        metadata: {
          projectId: vo.projectId,
          orderNumber: vo.orderNumber,
          title: vo.title,
          impactAmount: totalImpactAmount.toFixed(2),
          linesCount: linesData.length,
        },
      },
    });

    return vo;
  });

  logger.info('variation_order.updated', {
    correlationId,
    variationId: updated.id,
    orderNumber: updated.orderNumber,
    projectId: updated.projectId,
    actorId: actor.id,
    role: actor.role,
    impactAmount: totalImpactAmount.toFixed(2),
  });

  return toVariationOrderDetailDTO(updated as unknown as VariationOrderQueryRow);
}
