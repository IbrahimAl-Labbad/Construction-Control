'use server';

/**
 * app/expenses/actions.ts
 *
 * Server Actions for Field Expense Claimants (Create, Edit, Delete, Submit, Reopen).
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and domain rules to use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never leaks internal database errors or server-only instances to client.
 */

import { revalidatePath } from 'next/cache';

import { handleActionError } from '@/lib/errors';
import {
  createExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  submitExpense,
  reopenExpenseDraft,
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
  return handleActionError(error, 'حدث خطأ غير متوقع أثناء معالجة المصروف');
}

/**
 * Creates a new expense draft claim.
 */
export async function createExpenseDraftAction(rawInput: unknown): Promise<ActionResult> {
  try {
    const expense = await createExpenseDraft(rawInput);
    revalidatePath('/expenses');
    revalidatePath(`/projects/${expense.projectId}/expenses`);
    return { success: true, data: expense };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Updates an existing draft expense.
 */
export async function updateExpenseDraftAction(
  expenseId: string,
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const expense = await updateExpenseDraft(expenseId, rawInput);
    revalidatePath('/expenses');
    revalidatePath(`/projects/${expense.projectId}/expenses`);
    return { success: true, data: expense };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Soft deletes a draft expense.
 */
export async function deleteExpenseDraftAction(
  expenseId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    await deleteExpenseDraft(expenseId);
    revalidatePath('/expenses');
    return { success: true };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Submits a draft expense for approval.
 */
export async function submitExpenseAction(expenseId: string): Promise<ActionResult> {
  try {
    const expense = await submitExpense(expenseId);
    revalidatePath('/expenses');
    revalidatePath(`/projects/${expense.projectId}/expenses`);
    return { success: true, data: expense };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Reopens a rejected expense claim back to draft.
 */
export async function reopenExpenseDraftAction(expenseId: string): Promise<ActionResult> {
  try {
    const expense = await reopenExpenseDraft(expenseId);
    revalidatePath('/expenses');
    revalidatePath(`/projects/${expense.projectId}/expenses`);
    return { success: true, data: expense };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
