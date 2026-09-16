/**
 * lib/commitments/use-cases/get-commitment.ts
 *
 * Use case: Fetches a single Commitment by ID.
 *
 * Enforces:
 * 1. Authentication & active status check.
 * 2. ID validation.
 * 3. Returns client-safe DTO.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { commitmentIdSchema } from '@/lib/validation/schemas/commitment';

import { toCommitmentSummaryDTO } from '../mappers';
import type { CommitmentSummaryDTO } from '../types';

export async function getCommitment(commitmentId: unknown): Promise<CommitmentSummaryDTO> {
  const actor = await requireAuth();
  if (!policies.canViewCommitments(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض الالتزام');
  }

  const idValidation = validate(commitmentIdSchema, commitmentId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const commitment = await prisma.commitment.findFirst({
    where: { id, deletedAt: null },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
  });

  if (!commitment) {
    throw new AppError('NOT_FOUND', 'الالتزام غير موجود');
  }

  return toCommitmentSummaryDTO(commitment);
}
