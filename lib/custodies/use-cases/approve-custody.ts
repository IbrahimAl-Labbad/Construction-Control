/**
 * lib/custodies/use-cases/approve-custody.ts
 *
 * Use case: Manager formally approves a submitted Custody request.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively.
 * 2. Separation of duties:
 *    - actor.id !== custody.createdById (creator cannot self-approve)
 *    - actor.id !== custody.custodianUserId (custodian cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Lock Hierarchy (Canonical Order) & Stale-Linkage Retry:
 *    1. SELECT id, amount, "budgetId" FROM budget_lines WHERE id = ... FOR UPDATE
 *    2. SELECT id, status, amount, "budgetLineId", "projectId", "deletedAt" FROM custodies WHERE id = ... FOR UPDATE
 * 5. Note on Financial Invariants:
 *    - APPROVED custody creates NO active budget exposure.
 *    - No cash has left corporate accounts.
 *    - Validates advance ceiling fits within total authorized line amount.
 * 6. Atomicity: Status update + CUSTODY_APPROVED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, ProjectStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

export async function approveCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const now = new Date();
  let approved;

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
    // 3. Pre-transaction fetch for sanity & separation-of-duties check
    const preCheck = await prisma.custody.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        createdById: true,
        custodianUserId: true,
        budgetLineId: true,
        amount: true,
        projectId: true,
      },
    });

    if (!preCheck) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
    }

    // 4. Assert separation of duties: Manager cannot be the creator OR the custodian
    if (preCheck.createdById === actor.id || preCheck.custodianUserId === actor.id) {
      throw new AppError(
        'FORBIDDEN_SELF_APPROVAL',
        'لا يمكن للمعتمد اعتماد عهدة قام بإنشائها أو عُيّن أميناً لها (مبدأ فصل المهام)',
      );
    }

    // 5. Assert state machine transition (SUBMITTED -> APPROVED)
    assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.APPROVED);

    const candidateBudgetLineId = preCheck.budgetLineId;

    // 6. Execute atomic approval transaction with Canonical Lock Hierarchy
    try {
      approved = await prisma.$transaction(async (tx) => {
        // 6.1 STEP 1: Lock the parent BudgetLine row (Canonical Lock Order 1)
        let lockedLine: { id: string; amount: Prisma.Decimal; budgetId?: string } | undefined;
        if (typeof tx.$queryRaw === 'function') {
          const lockedLines = await tx.$queryRaw<
            Array<{ id: string; amount: Prisma.Decimal; budgetId?: string }>
          >`
            SELECT id, amount, "budgetId" FROM budget_lines
            WHERE id = ${candidateBudgetLineId}
            FOR UPDATE
          `;
          lockedLine = lockedLines[0];
          if (!lockedLine) {
            throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
          }
        }

        // 6.2 STEP 2: Lock the Custody row (Canonical Lock Order 2)
        let lockedCustody:
          | {
              id: string;
              status: CustodyStatus;
              amount: Prisma.Decimal;
              budgetLineId?: string;
              projectId?: string;
              deletedAt?: Date | null;
            }
          | undefined;

        if (typeof tx.$queryRaw === 'function') {
          const lockedCustodies = await tx.$queryRaw<
            Array<{
              id: string;
              status: CustodyStatus;
              amount: Prisma.Decimal;
              budgetLineId?: string;
              projectId?: string;
              deletedAt?: Date | null;
            }>
          >`
            SELECT id, status, amount, "budgetLineId", "projectId", "deletedAt" FROM custodies
            WHERE id = ${id}
            FOR UPDATE
          `;
          lockedCustody = lockedCustodies[0];
          if (!lockedCustody) {
            throw new AppError('NOT_FOUND', 'العهدة غير موجودة');
          }
        }

        if (lockedCustody?.deletedAt) {
          throw new AppError('RECORD_DELETED', 'لا يمكن اعتماد عهدة محذوفة');
        }

        const currentStatus = lockedCustody?.status ?? preCheck.status;
        if (currentStatus !== CustodyStatus.SUBMITTED) {
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            `لا يمكن اعتماد العهدة وهي في حالة "${currentStatus}"، يجب أن تكون قيد الاعتماد (SUBMITTED)`,
          );
        }

        if (lockedCustody?.budgetLineId && lockedCustody.budgetLineId !== candidateBudgetLineId) {
          throw new StaleLinkageRetryError();
        }

        const effectiveProjectId = lockedCustody?.projectId ?? preCheck.projectId;
        const effectiveBudgetLineId = lockedCustody?.budgetLineId ?? candidateBudgetLineId;
        const effectiveAmount = lockedCustody?.amount ?? preCheck.amount;

        // 6.3 Revalidate project & budget invariants
        const project = await tx.project.findFirst({
          where: { id: effectiveProjectId, deletedAt: null },
          select: { id: true, status: true },
        });

        if (!project || project.status !== ProjectStatus.ACTIVE) {
          throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
        }

        const approvedBudget = await tx.budget.findFirst({
          where: {
            projectId: effectiveProjectId,
            status: BudgetStatus.APPROVED,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!approvedBudget) {
          throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
        }

        if (lockedLine?.budgetId && lockedLine.budgetId !== approvedBudget.id) {
          throw new AppError(
            'INVALID_BUDGET_LINE',
            'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع',
          );
        }

        if (typeof tx.budgetLine?.findFirst === 'function') {
          const targetBudgetLine = await tx.budgetLine.findFirst({
            where: {
              id: effectiveBudgetLineId,
              budgetId: approvedBudget.id,
            },
            select: { id: true, amount: true },
          });

          if (!targetBudgetLine) {
            throw new AppError(
              'INVALID_BUDGET_LINE',
              'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع',
            );
          }
        }

        // 6.4 Basic Sanity: advance envelope cannot exceed total budget line ceiling
        const lineCapacity = lockedLine?.amount;
        if (lineCapacity && effectiveAmount.greaterThan(lineCapacity)) {
          throw new AppError(
            'BUDGET_LINE_EXCEEDED',
            `مبلغ العهدة (${effectiveAmount.toFixed(2)} ر.س) يتجاوز سقف بند الموازنة الإجمالي (${lineCapacity.toFixed(2)} ر.س)`,
          );
        }

        // 6.5 Update custody status to APPROVED
        const updated = await tx.custody.update({
          where: { id },
          data: {
            status: CustodyStatus.APPROVED,
            approvedById: actor.id,
            approvedAt: now,
          },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            submittedBy: { select: { id: true, name: true, email: true } },
            approvedBy: { select: { id: true, name: true, email: true } },
            custodian: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true, code: true } },
            budgetLine: { select: { id: true, category: true, description: true, amount: true } },
          },
        });

        // 6.6 Write CUSTODY_APPROVED audit log
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'CUSTODY_APPROVED',
            entityType: 'CUSTODY',
            entityId: updated.id,
            metadata: {
              code: updated.code,
              projectId: updated.projectId,
              budgetLineId: updated.budgetLineId,
              amount: updated.amount.toFixed(2),
              approvedAt: now.toISOString(),
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
            'تغير ارتباط بند الموازنة للعهدة أثناء الاعتماد؛ يرجى إعادة المحاولة',
          );
        }
        continue;
      }

      if (!(error instanceof AppError)) {
        logger.error('custody.approval_transaction_failed', {
          custodyId: id,
          actorId: actor.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  if (!approved) {
    throw new AppError(
      'CONFLICT',
      'تغير ارتباط بند الموازنة للعهدة أثناء الاعتماد؛ يرجى إعادة المحاولة',
    );
  }

  logger.info('custody.approved', {
    custodyId: approved.id,
    projectId: approved.projectId,
    budgetLineId: approved.budgetLineId,
    actorId: actor.id,
    amount: approved.amount.toFixed(2),
  });

  return toCustodySummaryDTO(approved);
}
