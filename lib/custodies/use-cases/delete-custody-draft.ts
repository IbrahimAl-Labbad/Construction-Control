/**
 * lib/custodies/use-cases/delete-custody-draft.ts
 *
 * Use case: Creator soft-deletes a Custody draft.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: Only the creator can delete their draft.
 * 3. Status guard: Custody must be in DRAFT status. (Issued custodies can never be deleted).
 * 4. Atomicity: Soft deletion + CUSTODY_DELETED AuditLog in SAME transaction.
 */

import { CustodyStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

export async function deleteCustodyDraft(
  custodyId: unknown,
): Promise<{ success: true; id: string }> {
  // 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT
  const actor = await requireRole([Role.ENGINEER, Role.ACCOUNTANT]);

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic transaction to soft-delete draft
  await prisma.$transaction(async (tx) => {
    const custody = await tx.custody.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, status: true, createdById: true, amount: true },
    });

    if (!custody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها بالفعل');
    }

    // 3.1 Verify ownership
    if (custody.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك حذف مسودة عهدة قام مستخدم آخر بإنشائها');
    }

    // 3.2 Verify DRAFT status
    if (custody.status !== CustodyStatus.DRAFT) {
      throw new AppError(
        'CUSTODY_NOT_DRAFT',
        `لا يمكن حذف العهدة وهي في حالة "${custody.status}"، الحذف متاح فقط للمسودات`,
      );
    }

    const now = new Date();

    // 3.3 Soft-delete
    await tx.custody.update({
      where: { id },
      data: { deletedAt: now },
    });

    // 3.4 Write CUSTODY_DELETED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_DELETED',
        entityType: 'CUSTODY',
        entityId: custody.id,
        metadata: {
          code: custody.code,
          amount: custody.amount.toFixed(2),
          deletedAt: now.toISOString(),
        },
      },
    });
  });

  return { success: true, id };
}
