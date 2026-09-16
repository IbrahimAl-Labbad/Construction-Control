'use server';

/**
 * app/(manager)/projects/[projectId]/expenses/actions.ts
 *
 * Server Actions for Project Expense Manager operations (Approve, Reject).
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
  approveExpense,
  rejectExpense,
  type ExpenseSummaryDTO,
} from '@/lib/expenses';

export type ActionSuccess<T = ExpenseSummaryDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = ExpenseSummaryDTO> = ActionSuccess<T> | ActionFailure;

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
    message: 'حدث خطأ غير متوقع أثناء معالجة المصروف',
  };
}

/**
 * Formally approves a submitted expense claim.
 */
export async function approveExpenseAction(
  projectId: string,
  expenseId: string,
): Promise<ActionResult> {
  try {
    const approved = await approveExpense(expenseId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/expenses`);
    revalidatePath('/expenses');
    return { success: true, data: approved };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Formally rejects a submitted expense claim with a mandatory reason.
 */
export async function rejectExpenseAction(
  projectId: string,
  expenseId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const rejected = await rejectExpense(expenseId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/expenses`);
    revalidatePath('/expenses');
    return { success: true, data: rejected };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
