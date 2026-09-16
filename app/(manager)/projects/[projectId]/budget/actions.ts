'use server';

/**
 * app/(manager)/projects/[projectId]/budget/actions.ts
 *
 * Server Actions for Project Budget operations.
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and validation to domain use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never leaks internal database errors or server-only instances to client.
 */

import { revalidatePath } from 'next/cache';

import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import {
  createBudgetDraft,
  updateBudgetDraft,
  submitBudget,
  approveBudget,
  rejectBudget,
  reopenBudgetDraft,
  type BudgetDetailsDTO,
} from '@/lib/budget';

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

export type ActionSuccess<T = BudgetDetailsDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = BudgetDetailsDTO> = ActionSuccess<T> | ActionFailure;

// ---------------------------------------------------------------------------
// Error mapper
// ---------------------------------------------------------------------------

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
    message: 'حدث خطأ غير متوقع أثناء معالجة الموازنة',
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Creates a new Version 1 budget draft for a project.
 */
export async function createBudgetDraftAction(
  projectId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const payload =
      typeof rawInput === 'object' && rawInput !== null
        ? { ...rawInput, projectId }
        : { projectId };

    const budget = await createBudgetDraft(payload);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Updates an existing budget draft.
 */
export async function updateBudgetDraftAction(
  projectId: string,
  budgetId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const budget = await updateBudgetDraft(budgetId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Submits a draft budget for formal approval.
 */
export async function submitBudgetAction(
  projectId: string,
  budgetId: string,
): Promise<ActionResult> {
  try {
    const budget = await submitBudget(budgetId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Formally approves a submitted budget.
 */
export async function approveBudgetAction(
  projectId: string,
  budgetId: string,
): Promise<ActionResult> {
  try {
    const budget = await approveBudget(budgetId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Formally rejects a submitted budget with a reason.
 */
export async function rejectBudgetAction(
  projectId: string,
  budgetId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const budget = await rejectBudget(budgetId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Reopens a rejected budget draft on the same Version 1 record.
 */
export async function reopenBudgetDraftAction(
  projectId: string,
  budgetId: string,
): Promise<ActionResult> {
  try {
    const budget = await reopenBudgetDraft(budgetId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/budget`);
    return { success: true, data: budget };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
