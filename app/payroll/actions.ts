'use server';

/**
 * app/payroll/actions.ts
 *
 * Server Actions for Payroll Data Entry / Project Labor Cost Control
 * (Create Draft, Update Draft, Delete Draft, Submit, Approve, Reject, Reopen, Cancel).
 *
 * Enforces AGENTS.md §6, §7 & §26:
 * - Pure Server Action boundary ('use server').
 * - Delegates all authorization and domain rules directly to use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never leaks internal database errors, SQL, stack traces, or server-only instances to client.
 * - Revalidates affected operational and project financial paths upon successful mutation.
 */

import { revalidatePath } from 'next/cache';

import { handleActionError } from '@/lib/errors';
import {
  approvePayroll,
  cancelPayroll,
  createPayrollDraft,
  deletePayrollDraft,
  type PayrollDetailDTO,
  rejectPayroll,
  reopenPayroll,
  submitPayroll,
  updatePayrollDraft,
} from '@/lib/payroll';
import type {
  CancelPayrollInput,
  CreatePayrollDraftInput,
  RejectPayrollInput,
  UpdatePayrollDraftInput,
} from '@/lib/validation/schemas/payroll';

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

export type ActionSuccess<T = PayrollDetailDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = PayrollDetailDTO> = ActionSuccess<T> | ActionFailure;

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleUseCaseError(error: unknown): ActionFailure {
  return handleActionError(error, 'حدث خطأ غير متوقع أثناء معالجة بيانات الرواتب');
}

// ---------------------------------------------------------------------------
// Path revalidation helper
// ---------------------------------------------------------------------------

function revalidatePayrollPaths(projectId?: string, payrollId?: string): void {
  revalidatePath('/payroll');
  revalidatePath('/approvals');
  revalidatePath('/dashboard');
  if (payrollId) {
    revalidatePath(`/payroll/${payrollId}`);
  }
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/payroll`);
  }
}


// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Creates a new payroll draft entry.
 * Only ACCOUNTANT role is authorized (enforced in use-case).
 */
export async function createPayrollDraftAction(
  input: CreatePayrollDraftInput,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await createPayrollDraft(input);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Updates an existing draft payroll entry.
 * Only the creating ACCOUNTANT may update while in DRAFT status (enforced in use-case).
 */
export async function updatePayrollDraftAction(
  payrollId: string,
  input: UpdatePayrollDraftInput,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await updatePayrollDraft(payrollId, input);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Soft deletes a draft payroll entry.
 * Only the creating ACCOUNTANT may delete while in DRAFT status (enforced in use-case).
 */
export async function deletePayrollDraftAction(
  payrollId: string,
): Promise<ActionResult<{ deleted: true; id: string }>> {
  try {
    const result = await deletePayrollDraft(payrollId);
    revalidatePayrollPaths(undefined, payrollId);
    return { success: true, data: { deleted: true, id: result.payrollId } };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Submits a draft payroll entry for Manager approval.
 * Only the creating ACCOUNTANT may submit while in DRAFT status (enforced in use-case).
 */
export async function submitPayrollAction(
  payrollId: string,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await submitPayroll(payrollId);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Approves a submitted payroll entry. MANAGER only (enforced in use-case).
 * Enforces budget ceiling and concurrency controls.
 */
export async function approvePayrollAction(
  payrollId: string,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await approvePayroll(payrollId);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Rejects a submitted payroll entry back to draft. MANAGER only (enforced in use-case).
 * Rejection reason is mandatory.
 */
export async function rejectPayrollAction(
  payrollId: string,
  input: RejectPayrollInput,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await rejectPayroll(payrollId, input);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Reopens a REJECTED payroll entry back to DRAFT for corrections.
 * ACCOUNTANT (creator) only (enforced in use-case).
 */
export async function reopenPayrollAction(
  payrollId: string,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await reopenPayroll(payrollId);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Cancels a DRAFT or SUBMITTED payroll entry.
 * Follows locked state/role matrix:
 * - DRAFT: Accountant (creator) or Manager
 * - SUBMITTED: Manager only
 * - REJECTED, APPROVED, CANCELLED: Denied for all.
 */
export async function cancelPayrollAction(
  payrollId: string,
  input: CancelPayrollInput,
): Promise<ActionResult<PayrollDetailDTO>> {
  try {
    const entry = await cancelPayroll(payrollId, input);
    revalidatePayrollPaths(entry.projectId, entry.id);
    return { success: true, data: entry };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
