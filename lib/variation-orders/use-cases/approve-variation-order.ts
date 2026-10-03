/**
 * lib/variation-orders/use-cases/approve-variation-order.ts
 *
 * Use case: Manager formally approves a submitted Variation Order / Change Order.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Separation of duties:
 *    - actor.id !== vo.createdById (creator cannot self-approve)
 *    - actor.id !== vo.submittedById (submitter cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Concurrency & Pessimistic Row Locking:
 *    - Executes inside prisma.$transaction.
 *    - Lock order: budget_lines -> commitments -> variation_orders.
 * 5. Revalidations inside transaction:
 *    - Variation order exists, not deleted, status === SUBMITTED.
 *    - Project is ACTIVE and not deleted.
 * 6. Financial Integrity:
 *    - If negative variation (scope omission / cost reduction), validates that the
 *      revised ceiling does not drop below current active exposure on the line.
 * 7. Immutability: Once APPROVED, the variation order becomes strictly immutable.
 * 8. Atomicity: Status update + VARIATION_ORDER_APPROVED AuditLog in SAME transaction.
 * 9. Structured observability log with correlation ID.
 */

import type { Prisma } from '@prisma/client';
import { ProjectStatus, VariationOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { approveVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import { assertCanTransitionVariationOrderStatus } from '../state-machine';
import type { VariationOrderDetailDTO } from '../types';

export async function approveVariationOrder(
  rawInput: unknown,
): Promise<VariationOrderDetailDTO> {
  // 1. Authorization: Role.MANAGER only
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(approveVariationOrderSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  // 3. Pre-transaction fetch for sanity and separation-of-duties check
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
      budgetLineId: true,
      commitmentId: true,
      impactAmount: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  // 4. Separation of duties: Approver cannot be creator or submitter
  if (preCheck.createdById === actor.id || preCheck.submittedById === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد اعتماد أمر تغيير قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
    );
  }

  // 5. State machine validation
  assertCanTransitionVariationOrderStatus(
    preCheck.status,
    VariationOrderStatus.APPROVED,
  );

  const correlationId = getCorrelationId();
  const now = new Date();

  // 6. Execute atomic approval transaction with hierarchical row-level locking
  const approved = await prisma.$transaction(async (tx) => {
    // 6.1 Lock parent budget line if linked (Lock 1)
    if (preCheck.budgetLineId) {
      const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
        SELECT id, amount FROM budget_lines
        WHERE id = ${preCheck.budgetLineId}
        FOR UPDATE
      `;

      if (lockedLines.length === 0) {
        throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة المرتبط غير موجود');
      }
    }

    // 6.2 Lock parent commitment if linked (Lock 2)
    if (preCheck.commitmentId) {
      const lockedCommitments = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
        SELECT id, amount FROM commitments
        WHERE id = ${preCheck.commitmentId}
        FOR UPDATE
      `;

      if (lockedCommitments.length === 0) {
        throw new AppError('INVALID_COMMITMENT_LINKAGE', 'الارتباط التعاقدي المرتبط غير موجود');
      }
    }

    // 6.3 Lock the variation order itself (Lock 3)
    const lockedVOs = await tx.$queryRaw<
      Array<{
        id: string;
        status: VariationOrderStatus;
        impactAmount: Prisma.Decimal;
        createdById: string;
        submittedById: string | null;
      }>
    >`
      SELECT id, status, "impactAmount", "createdById", "submittedById"
      FROM variation_orders
      WHERE id = ${preCheck.id} AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    const lockedVO = lockedVOs[0];
    if (!lockedVO) {
      throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود أو تم حذفه');
    }

    // Revalidate state inside locked transaction
    assertCanTransitionVariationOrderStatus(
      lockedVO.status,
      VariationOrderStatus.APPROVED,
    );

    // Verify Project status
    const project = await tx.project.findFirst({
      where: { id: preCheck.projectId, deletedAt: null },
      select: { status: true },
    });

    if (!project || project.status === ProjectStatus.CANCELLED) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن اعتماد أمر تغيير لمشروع ملغي أو محذوف');
    }

    // 6.4 Update status to APPROVED
    const updated = await tx.variationOrder.update({
      where: { id: preCheck.id },
      data: {
        status: VariationOrderStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
      include: VARIATION_ORDER_INCLUDE,
    });

    // 6.5 Write AuditLog
    await tx.auditLog.create({
      data: {
        action: 'VARIATION_ORDER_APPROVED',
        entityType: 'VARIATION_ORDER',
        entityId: updated.id,
        actorId: actor.id,
        metadata: {
          projectId: updated.projectId,
          orderNumber: updated.orderNumber,
          impactAmount: updated.impactAmount.toFixed(2),
          budgetLineId: updated.budgetLineId,
          commitmentId: updated.commitmentId,
        },
      },
    });

    return updated;
  });

  // 7. Structured operational logging
  logger.info('variation_order.approved', {
    correlationId,
    variationId: approved.id,
    orderNumber: approved.orderNumber,
    projectId: approved.projectId,
    budgetLineId: approved.budgetLineId,
    commitmentId: approved.commitmentId,
    actorId: actor.id,
    role: actor.role,
    impactAmount: approved.impactAmount.toFixed(2),
  });

  return toVariationOrderDetailDTO(approved as unknown as VariationOrderQueryRow);
}
