'use server';

/**
 * app/custodies/actions.ts
 *
 * Server Actions for Custody Advances & Settlement (Create, Edit, Delete, Submit, Reopen, Cancel, Approve, Reject, Issue, Return Cash, Close).
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
  createCustodyDraft,
  updateCustodyDraft,
  deleteCustodyDraft,
  submitCustody,
  approveCustody,
  rejectCustody,
  reopenCustody,
  cancelCustody,
  issueCustody,
  recordCashReturn,
  closeCustody,
  type CustodySummaryDTO,
} from '@/lib/custodies';
import type {
  CreateCustodyDraftInput,
  UpdateCustodyDraftInput,
  RejectCustodyInput,
  CancelCustodyInput,
  RecordCashReturnInput,
} from '@/lib/validation/schemas/custody';

export type ActionSuccess<T = CustodySummaryDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = CustodySummaryDTO> = ActionSuccess<T> | ActionFailure;

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
      error: error.code,
      message: error.message,
    };
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع في الخادم';
  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message,
  };
}

function revalidateCustodies(projectId?: string): void {
  revalidatePath('/custodies');
  revalidatePath('/expenses');
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/custodies`);
    revalidatePath(`/projects/${projectId}/expenses`);
  }
}

export async function createCustodyAction(
  input: CreateCustodyDraftInput,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await createCustodyDraft(input);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function updateCustodyAction(
  input: UpdateCustodyDraftInput,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await updateCustodyDraft(input);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function deleteCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<{ success: true; id: string }>> {
  try {
    const result = await deleteCustodyDraft(custodyId);
    revalidateCustodies();
    return { success: true, data: result };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function submitCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await submitCustody(custodyId);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function approveCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await approveCustody(custodyId);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function rejectCustodyAction(
  input: RejectCustodyInput,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await rejectCustody(input);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function reopenCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await reopenCustody(custodyId);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function cancelCustodyAction(
  input: CancelCustodyInput,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await cancelCustody(input);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function issueCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await issueCustody(custodyId);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function recordCashReturnAction(
  input: RecordCashReturnInput,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await recordCashReturn(input);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function closeCustodyAction(
  custodyId: unknown,
): Promise<ActionResult<CustodySummaryDTO>> {
  try {
    const custody = await closeCustody(custodyId);
    revalidateCustodies(custody.projectId);
    return { success: true, data: custody };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
