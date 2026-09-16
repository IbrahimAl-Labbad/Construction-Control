'use server';

/**
 * app/commitments/actions.ts
 *
 * Server Actions for Purchasing & Operations Commitments (Create, Edit, Delete, Submit, Reopen, Approve, Reject).
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and domain rules to use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never leaks internal database errors or server-only instances to client.
 */

import { revalidatePath } from 'next/cache';

import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import {
  createCommitmentDraft,
  updateCommitmentDraft,
  deleteCommitmentDraft,
  submitCommitment,
  reopenCommitment,
  approveCommitment,
  rejectCommitment,
  type CommitmentSummaryDTO,
} from '@/lib/commitments';
import type { RejectCommitmentInput } from '@/lib/validation/schemas/commitment';

export type ActionSuccess<T = CommitmentSummaryDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = CommitmentSummaryDTO> = ActionSuccess<T> | ActionFailure;

function handleUseCaseError(error: unknown): ActionFailure {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'بيانات غير صالحة',
      details: error.details,
    };
  }

  if (error instanceof AppError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
    };
  }

  if (error instanceof PermissionError) {
    return {
      success: false,
      error: 'FORBIDDEN',
      message: error.message,
    };
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: 'UNAUTHENTICATED',
      message: error.message,
    };
  }

  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'حدث خطأ غير متوقع أثناء معالجة الالتزام المالي',
  };
}

/**
 * Creates a new commitment draft.
 */
export async function createCommitmentDraftAction(rawInput: unknown): Promise<ActionResult> {
  try {
    const commitment = await createCommitmentDraft(rawInput as never);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Updates an existing draft commitment.
 */
export async function updateCommitmentDraftAction(
  commitmentId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const commitment = await updateCommitmentDraft(commitmentId, rawInput as never);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Soft deletes a draft commitment.
 */
export async function deleteCommitmentDraftAction(
  commitmentId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    await deleteCommitmentDraft(commitmentId);
    revalidatePath('/commitments');
    return { success: true };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Submits a draft commitment for Manager approval.
 */
export async function submitCommitmentAction(commitmentId: string): Promise<ActionResult> {
  try {
    const commitment = await submitCommitment(commitmentId);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Reopens a rejected commitment back to draft.
 */
export async function reopenCommitmentDraftAction(commitmentId: string): Promise<ActionResult> {
  try {
    const commitment = await reopenCommitment(commitmentId);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Approves a submitted commitment (Manager only).
 */
export async function approveCommitmentAction(commitmentId: string): Promise<ActionResult> {
  try {
    const commitment = await approveCommitment(commitmentId);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Rejects a submitted commitment with a reason (Manager only).
 */
export async function rejectCommitmentAction(
  commitmentId: string,
  input: RejectCommitmentInput,
): Promise<ActionResult> {
  try {
    const commitment = await rejectCommitment(commitmentId, input);
    revalidatePath('/commitments');
    revalidatePath(`/projects/${commitment.projectId}/commitments`);
    return { success: true, data: commitment };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
