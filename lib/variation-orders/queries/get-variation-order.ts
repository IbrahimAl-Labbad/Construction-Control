/**
 * lib/variation-orders/queries/get-variation-order.ts
 *
 * Fetches a single Variation Order with its BOQ line items and relation metadata.
 * Returns client-safe VariationOrderDetailDTO.
 *
 * Follows AGENTS.md §12, §18, §26.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth/session';
import { validate } from '@/lib/validation';
import { variationOrderIdSchema } from '@/lib/validation/schemas/variation-order';
import { toVariationOrderDetailDTO, type VariationOrderQueryRow } from '../mappers';
import type { VariationOrderDetailDTO } from '../types';

export const VARIATION_ORDER_INCLUDE = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  budgetLine: {
    select: {
      id: true,
      category: true,
      description: true,
      amount: true,
    },
  },
  commitment: {
    select: {
      id: true,
      vendorName: true,
      referenceNumber: true,
      amount: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  submittedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  rejectedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  lines: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

export async function getVariationOrder(id: unknown): Promise<VariationOrderDetailDTO> {
  await requireAuth();

  const idValidation = validate(variationOrderIdSchema, id);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const voId = idValidation.data;

  const row = await prisma.variationOrder.findFirst({
    where: {
      id: voId,
      deletedAt: null,
    },
    include: VARIATION_ORDER_INCLUDE,
  });

  if (!row) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود');
  }

  return toVariationOrderDetailDTO(row as unknown as VariationOrderQueryRow);
}
