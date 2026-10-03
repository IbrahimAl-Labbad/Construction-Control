/**
 * lib/variation-orders/use-cases/create-variation-order.ts
 *
 * Use case: Site Engineer creates a new Variation Order / Change Order draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER exclusively.
 * 2. Active assignment: Engineer must hold an ACTIVE assignment to the target project.
 * 3. Project validity: Project must exist, not deleted, and not CANCELLED.
 * 4. BudgetLine linkage validity (if provided): Must belong to the project's approved budget.
 * 5. Commitment linkage validity (if provided): Must belong to the project and be APPROVED.
 * 6. Server-side recalculation: Line item deltas and total impact amount are calculated server-side.
 * 7. Atomicity: VariationOrder + lines + AuditLog created in the exact same transaction.
 * 8. Structured operational logging with correlation tracking.
 */

import { BudgetStatus, CommitmentStatus, Prisma, ProjectStatus, Role, VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireRole } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team/queries/is-engineer-assigned-to-project';
import { validate } from '@/lib/validation';
import { createVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { calculateLineFinancialDelta, calculateVariationOrderTotalImpact } from '../calculations';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import type { VariationOrderDetailDTO } from '../types';

export async function createVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  // 1. Authorization: Role.ENGINEER only
  const actor = await requireRole(Role.ENGINEER);

  // 2. Validate input
  const validation = validate(createVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  // 3. Verify Project validity
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      status: true,
    },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  if (project.status === ProjectStatus.CANCELLED) {
    throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن إنشاء أمر تغيير لمشروع ملغي');
  }

  // 4. Verify Engineer project assignment
  const isAssigned = await isEngineerAssignedToProject(input.projectId, actor.id);
  if (!isAssigned) {
    throw new AppError(
      'FORBIDDEN',
      'غير مصرح: يجب أن يكون المهندس معيناً على هذا المشروع لإنشاء أمر تغيير',
    );
  }

  // 5. Verify BudgetLine if provided
  if (input.budgetLineId) {
    const budgetLine = await prisma.budgetLine.findFirst({
      where: {
        id: input.budgetLineId,
        budget: {
          projectId: input.projectId,
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

  // 6. Verify Commitment if provided
  if (input.commitmentId) {
    const commitment = await prisma.commitment.findFirst({
      where: {
        id: input.commitmentId,
        projectId: input.projectId,
        deletedAt: null,
        ...(input.budgetLineId ? { budgetLineId: input.budgetLineId } : {}),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!commitment) {
      throw new AppError(
        'INVALID_COMMITMENT_LINKAGE',
        'الارتباط التعاقدي المحدد غير موجود أو لا يتبع لهذا المشروع',
      );
    }

    if (commitment.status !== CommitmentStatus.APPROVED) {
      throw new AppError(
        'COMMITMENT_NOT_APPROVED',
        'لا يمكن ربط أمر التغيير إلا بارتباط تعاقدي معتمد',
      );
    }
  }

  // 7. Process BOQ Line Items and calculate financial deltas
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
    // Lump sum variation without line items
    if (input.impactAmount === undefined) {
      throw new AppError(
        'VALIDATION_ERROR',
        'يجب تحديد مبلغ الأثر المالي أو إدخال بنود كميات مفصلة لأمر التغيير',
      );
    }
    totalImpactAmount = new Prisma.Decimal(input.impactAmount);
  }

  // 8. Generate sequential order number per project inside transaction
  const correlationId = getCorrelationId();

  const created = await prisma.$transaction(async (tx) => {
    // Count existing VOs on this project
    const count = await tx.variationOrder.count({
      where: { projectId: input.projectId },
    });
    const orderNumber = `VO-${project.code}-${String(count + 1).padStart(3, '0')}`;

    const vo = await tx.variationOrder.create({
      data: {
        orderNumber,
        projectId: input.projectId,
        budgetLineId: input.budgetLineId ?? null,
        commitmentId: input.commitmentId ?? null,
        title: input.title,
        description: input.description,
        reason: input.reason,
        scopeImpact: input.scopeImpact ?? null,
        status: VariationOrderStatus.DRAFT,
        impactAmount: totalImpactAmount,
        currency: 'SAR',
        createdById: actor.id,
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

    // Write AuditLog inside transaction
    await tx.auditLog.create({
      data: {
        action: 'VARIATION_ORDER_CREATED',
        entityType: 'VARIATION_ORDER',
        entityId: vo.id,
        actorId: actor.id,
        metadata: {
          projectId: vo.projectId,
          orderNumber: vo.orderNumber,
          title: vo.title,
          impactAmount: totalImpactAmount.toFixed(2),
          linesCount: linesData.length,
          budgetLineId: vo.budgetLineId,
          commitmentId: vo.commitmentId,
        },
      },
    });

    return vo;
  });

  // 9. Structured observability log
  logger.info('variation_order.created', {
    correlationId,
    variationId: created.id,
    orderNumber: created.orderNumber,
    projectId: created.projectId,
    actorId: actor.id,
    role: actor.role,
    impactAmount: totalImpactAmount.toFixed(2),
    linesCount: linesData.length,
  });

  return toVariationOrderDetailDTO(created as unknown as VariationOrderQueryRow);
}
