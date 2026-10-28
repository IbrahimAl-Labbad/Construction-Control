/**
 * lib/variation-orders/use-cases/approve-variation-order.ts
 *
 * Use case: Manager formally approves a submitted Variation Order / Change Order.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Separation of duties (revalidated under lock):
 *    - actor.id !== vo.createdById (creator cannot self-approve)
 *    - actor.id !== vo.submittedById (submitter cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Concurrency & Pessimistic Row Locking:
 *    - Stale-Linkage Retry loop (MAX_LINKAGE_RETRIES = 3).
 *    - Canonical lock order: budget_lines -> commitments -> variation_orders.
 * 5. Revalidations inside transaction:
 *    - Variation order exists, not deleted, status === SUBMITTED.
 *    - Project is ACTIVE / not CANCELLED and not deleted.
 *    - BudgetLine belongs to project's active APPROVED budget.
 *    - Commitment is APPROVED and belongs to project.
 * 6. Financial Integrity:
 *    - If negative variation on commitment, validates revised ceiling does not drop below certified billings.
 *    - If negative variation on budget line, validates revised ceiling does not drop below current active exposure.
 * 7. Immutability: Once APPROVED, the variation order becomes strictly immutable.
 * 8. Atomicity: Status update + VARIATION_ORDER_APPROVED AuditLog in SAME transaction.
 * 9. Structured observability log with correlation ID.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  ProjectStatus,
  SubcontractorBillingStatus,
  VariationOrderStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger, getCorrelationId } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { approveVariationOrderSchema } from '@/lib/validation/schemas/variation-order';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import { VARIATION_ORDER_INCLUDE } from '../queries/get-variation-order';
import { assertCanTransitionVariationOrderStatus } from '../state-machine';
import { sumOutstandingCustodyBalances } from '@/lib/custodies/calculations';
import type { VariationOrderDetailDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

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

  const correlationId = getCorrelationId();
  const now = new Date();
  let approved;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
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

    // 4. Separation of duties pre-check
    if (preCheck.createdById === actor.id || preCheck.submittedById === actor.id) {
      throw new AppError(
        'FORBIDDEN_SELF_APPROVAL',
        'لا يمكن للمعتمد اعتماد أمر تغيير قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
      );
    }

    // 5. State machine pre-validation
    assertCanTransitionVariationOrderStatus(
      preCheck.status,
      VariationOrderStatus.APPROVED,
    );

    try {
      approved = await prisma.$transaction(async (tx) => {
        if (typeof tx.$queryRaw === 'function') {
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
          await tx.$queryRaw`
            SELECT id, status, "impactAmount", "createdById", "submittedById", "budgetLineId", "commitmentId", "projectId", "deletedAt", "orderNumber"
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
            impactAmount: true,
            createdById: true,
            submittedById: true,
            budgetLineId: true,
            commitmentId: true,
            projectId: true,
            deletedAt: true,
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

        // Revalidate separation of duties under lock
        if (lockedVO.createdById === actor.id || lockedVO.submittedById === actor.id) {
          throw new AppError(
            'FORBIDDEN_SELF_APPROVAL',
            'لا يمكن للمعتمد اعتماد أمر تغيير قام بإنشائه أو تقديمه بنفسه (مبدأ فصل المهام)',
          );
        }

        // Revalidate state inside locked transaction
        assertCanTransitionVariationOrderStatus(
          lockedVO.status,
          VariationOrderStatus.APPROVED,
        );

        // Verify Project status
        const project = await tx.project.findFirst({
          where: { id: lockedVO.projectId, deletedAt: null },
          select: { status: true },
        });

        if (!project || project.status === ProjectStatus.CANCELLED) {
          throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن اعتماد أمر تغيير لمشروع ملغي أو محذوف');
        }

        // Revalidate linkages and financial integrity
        let lockedLineRecord: { id: string; amount: Prisma.Decimal } | null = null;
        if (lockedVO.budgetLineId) {
          lockedLineRecord = await tx.budgetLine.findFirst({
            where: {
              id: lockedVO.budgetLineId,
              budget: {
                projectId: lockedVO.projectId,
                status: BudgetStatus.APPROVED,
                deletedAt: null,
              },
            },
            select: { id: true, amount: true },
          });

          if (!lockedLineRecord) {
            throw new AppError(
              'INVALID_BUDGET_LINE',
              'بند الموازنة المرتبط غير صالح أو لا يتبع للموازنة المعتمدة للمشروع',
            );
          }
        }

        let lockedCommitmentRecord: { id: string; amount: Prisma.Decimal; status: CommitmentStatus } | null = null;
        if (lockedVO.commitmentId) {
          lockedCommitmentRecord = await tx.commitment.findFirst({
            where: {
              id: lockedVO.commitmentId,
              projectId: lockedVO.projectId,
              deletedAt: null,
            },
            select: { id: true, amount: true, status: true },
          });

          if (!lockedCommitmentRecord || lockedCommitmentRecord.status !== CommitmentStatus.APPROVED) {
            throw new AppError(
              'COMMITMENT_NOT_APPROVED',
              'لا يمكن اعتماد أمر تغيير مرتبط بالتزام غير معتمد',
            );
          }
        }

        // Financial Integrity: Negative variation reduction checks
        const impact = lockedVO.impactAmount;
        if (impact.lessThan(new Prisma.Decimal('0.00'))) {
          // Check 1: If linked to commitment, revised ceiling must not drop below cumulative certified billings
          if (lockedCommitmentRecord && lockedVO.commitmentId) {
            const existingApprovedVOs = await tx.variationOrder.aggregate({
              where: {
                commitmentId: lockedVO.commitmentId,
                status: VariationOrderStatus.APPROVED,
                deletedAt: null,
                id: { not: lockedVO.id },
              },
              _sum: { impactAmount: true },
            });
            const approvedVOsSum = existingApprovedVOs._sum.impactAmount ?? new Prisma.Decimal('0.00');
            const revisedCommitmentCeiling = lockedCommitmentRecord.amount.add(approvedVOsSum).add(impact);

            const approvedBillings = await tx.subcontractorBilling.aggregate({
              where: {
                commitmentId: lockedVO.commitmentId,
                status: SubcontractorBillingStatus.APPROVED,
                deletedAt: null,
              },
              _sum: { grossAmount: true },
            });
            const cumulativeCertified = approvedBillings._sum.grossAmount ?? new Prisma.Decimal('0.00');

            if (revisedCommitmentCeiling.lessThan(cumulativeCertified)) {
              throw new AppError(
                'COMMITMENT_CEILING_EXCEEDED',
                `لا يمكن اعتماد أمر التغيير بتخفيض (${impact.abs().toFixed(2)} ر.س) لأنه يخفض سقف الارتباط التعاقدي (${revisedCommitmentCeiling.toFixed(2)} ر.س) إلى ما دون إجمالي المستخلصات المعتمدة (${cumulativeCertified.toFixed(2)} ر.س)`,
              );
            }
          }

          // Check 2: If linked to budgetLine, revised line ceiling must not drop below active exposure on line
          if (lockedLineRecord && lockedVO.budgetLineId) {
            const lineApprovedVOsAgg = await tx.variationOrder.aggregate({
              where: {
                budgetLineId: lockedVO.budgetLineId,
                status: VariationOrderStatus.APPROVED,
                deletedAt: null,
                id: { not: lockedVO.id },
              },
              _sum: { impactAmount: true },
            });
            const approvedLineVOsSum = lineApprovedVOsAgg._sum.impactAmount ?? new Prisma.Decimal('0.00');
            const revisedLineCeiling = lockedLineRecord.amount.add(approvedLineVOsSum).add(impact);

            // Calculate current active exposure on this budget line
            const commAgg = await tx.commitment.aggregate({
              where: { budgetLineId: lockedVO.budgetLineId, status: CommitmentStatus.APPROVED, deletedAt: null },
              _sum: { amount: true },
            });
            const approvedComm = commAgg._sum.amount ?? new Prisma.Decimal('0.00');

            const expAgg = await tx.expense.aggregate({
              where: { budgetLineId: lockedVO.budgetLineId, status: ExpenseStatus.APPROVED, deletedAt: null },
              _sum: { amount: true },
            });
            const approvedExp = expAgg._sum.amount ?? new Prisma.Decimal('0.00');

            const activeCustodies =
              typeof tx.custody?.findMany === 'function'
                ? await tx.custody.findMany({
                    where: {
                      budgetLineId: lockedVO.budgetLineId,
                      status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
                      deletedAt: null,
                    },
                    include: {
                      expenses: {
                        where: { status: ExpenseStatus.APPROVED, deletedAt: null },
                        select: { amount: true },
                      },
                    },
                  })
                : [];
            const outstandingCustody = sumOutstandingCustodyBalances(activeCustodies);

            const payrollAgg =
              typeof tx.payrollEntry?.aggregate === 'function'
                ? await tx.payrollEntry.aggregate({
                    where: { budgetLineId: lockedVO.budgetLineId, status: PayrollStatus.APPROVED, deletedAt: null },
                    _sum: { amount: true },
                  })
                : { _sum: { amount: null } };
            const approvedPayroll = payrollAgg._sum.amount ?? new Prisma.Decimal('0.00');

            const currentActiveExposure = approvedComm
              .add(approvedExp)
              .add(outstandingCustody)
              .add(approvedPayroll);

            if (revisedLineCeiling.lessThan(currentActiveExposure)) {
              throw new AppError(
                'BUDGET_LINE_EXCEEDED',
                `لا يمكن اعتماد أمر التغيير بتخفيض (${impact.abs().toFixed(2)} ر.س) لأنه يخفض سقف بند الموازنة (${revisedLineCeiling.toFixed(2)} ر.س) إلى ما دون إجمالي الالتزامات والمصروفات النشطة (${currentActiveExposure.toFixed(2)} ر.س)`,
              );
            }
          }
        }

        // 6.4 Update status to APPROVED
        const updated = await tx.variationOrder.update({
          where: { id: lockedVO.id },
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
      break;
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt === MAX_LINKAGE_RETRIES) {
          throw new AppError(
            'CONFLICT',
            'تغيرت بيانات الارتباط لأمر التغيير أثناء الاعتماد؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }
      throw error;
    }
  }

  if (!approved) {
    throw new AppError(
      'CONFLICT',
      'تغيرت بيانات الارتباط لأمر التغيير أثناء الاعتماد؛ يرجى إعادة المحاولة',
    );
  }

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
