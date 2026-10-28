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
 * 5. Concurrency & Row Locking:
 *    - Acquires pessimistic FOR UPDATE lock on variation_orders.
 *    - Revalidates draft status, ownership, and non-deleted state inside locked transaction.
 *    - Uses Stale-Linkage Retry pattern if candidate linkages shift.
 * 6. Atomicity: Header update + line replacement + AuditLog in single transaction.
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

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

export async function updateVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  const actor = await requireRole(Role.ENGINEER);

  const validation = validate(updateVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

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
  let updated;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    // 1. Pre-transaction fetch
    const preCheck = await prisma.variationOrder.findFirst({
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
        budgetLineId: true,
        commitmentId: true,
      },
    });

    if (!preCheck) {
      throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
    }

    // Check state machine: only DRAFT is editable
    if (!isVariationOrderEditable(preCheck.status)) {
      throw new AppError(
        'RECORD_NOT_EDITABLE',
        'لا يمكن تعديل أمر التغيير إلا عندما يكون في حالة مسودة (DRAFT)',
      );
    }

    // Object-level authorization: owner only
    if (preCheck.createdById !== actor.id) {
      throw new AppError(
        'FORBIDDEN',
        'غير مصرح: لا يمكن تعديل مسودة أمر التغيير إلا بواسطة المهندس الذي أنشأها',
      );
    }

    // Candidate linkage keys
    const candidateBudgetLineIds = Array.from(
      new Set([preCheck.budgetLineId, input.budgetLineId].filter((id): id is string => Boolean(id))),
    ).sort();

    const candidateCommitmentIds = Array.from(
      new Set([preCheck.commitmentId, input.commitmentId].filter((id): id is string => Boolean(id))),
    ).sort();

    try {
      updated = await prisma.$transaction(async (tx) => {
        if (typeof tx.$queryRaw === 'function') {
          // Lock Level 1: budget_lines in sorted order
          for (const blId of candidateBudgetLineIds) {
            await tx.$queryRaw`
              SELECT id FROM budget_lines WHERE id = ${blId} FOR UPDATE
            `;
          }

          // Lock Level 2: commitments in sorted order
          for (const commId of candidateCommitmentIds) {
            await tx.$queryRaw`
              SELECT id FROM commitments WHERE id = ${commId} FOR UPDATE
            `;
          }

          // Lock Level 3: variation_orders
          await tx.$queryRaw`
            SELECT id, status, "createdById", "projectId", "deletedAt", "budgetLineId", "commitmentId"
            FROM variation_orders
            WHERE id = ${input.id}
            FOR UPDATE
          `;
        }

        // Revalidate locked record
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
          },
        });

        if (!lockedVO || lockedVO.deletedAt !== null) {
          throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود أو تم حذفه');
        }

        if (!isVariationOrderEditable(lockedVO.status)) {
          throw new AppError(
            'RECORD_NOT_EDITABLE',
            'لا يمكن تعديل أمر التغيير إلا عندما يكون في حالة مسودة (DRAFT)',
          );
        }

        if (lockedVO.createdById !== actor.id) {
          throw new AppError(
            'FORBIDDEN',
            'غير مصرح: لا يمكن تعديل مسودة أمر التغيير إلا بواسطة المهندس الذي أنشأها',
          );
        }

        // Stale linkage check: if linkages on locked record shifted from preCheck, retry
        if (
          lockedVO.budgetLineId !== preCheck.budgetLineId ||
          lockedVO.commitmentId !== preCheck.commitmentId
        ) {
          throw new StaleLinkageRetryError();
        }

        // Verify BudgetLine if provided
        if (input.budgetLineId) {
          const budgetLine = await tx.budgetLine.findFirst({
            where: {
              id: input.budgetLineId,
              budget: {
                projectId: lockedVO.projectId,
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
          const commitment = await tx.commitment.findFirst({
            where: {
              id: input.commitmentId,
              projectId: lockedVO.projectId,
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

        // Delete existing lines
        await tx.variationOrderLine.deleteMany({
          where: { variationOrderId: lockedVO.id },
        });

        // Update header and insert new lines
        const vo = await tx.variationOrder.update({
          where: { id: lockedVO.id },
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
      break;
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt === MAX_LINKAGE_RETRIES) {
          throw new AppError(
            'CONFLICT',
            'تغيرت بيانات الارتباط لأمر التغيير أثناء التعديل؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }
      throw error;
    }
  }

  if (!updated) {
    throw new AppError(
      'CONFLICT',
      'تغيرت بيانات الارتباط لأمر التغيير أثناء التعديل؛ يرجى إعادة المحاولة',
    );
  }

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
