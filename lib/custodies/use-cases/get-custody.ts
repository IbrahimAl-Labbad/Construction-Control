/**
 * lib/custodies/use-cases/get-custody.ts
 *
 * Query: Fetches detailed custody record with all linked expenses.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodyDetailDTO } from '../mappers';
import type { CustodyDetailDTO } from '../types';

export async function getCustody(custodyId: unknown): Promise<CustodyDetailDTO> {
  await requireAuth();

  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const custody = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      custodian: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, code: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      expenses: {
        where: { deletedAt: null },
        include: {
          submittedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { expenseDate: 'desc' },
      },
    },
  });

  if (!custody) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة');
  }

  return toCustodyDetailDTO(custody);
}
