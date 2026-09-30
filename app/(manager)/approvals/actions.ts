'use server';

/**
 * app/(manager)/approvals/actions.ts
 *
 * Server actions for the Centralized Manager Approvals Hub.
 * Exposes 10 dispatch actions (approve & reject for all 5 domains).
 *
 * Enforces:
 * 1. Hard manager-only authorization check (`requireManager()`).
 * 2. ID and rejection reason validation.
 * 3. Delegation to canonical domain use cases.
 * 4. Cache revalidation on `/approvals`.
 * 5. Repository canonical error handling mapping to client-safe result objects.
 *
 * Follows AGENTS.md §8, §9, §12, §26.
 */

import { revalidatePath } from 'next/cache';
import { AppError, ValidationError, toAppError } from '@/lib/errors';
import { PermissionError, requireManager } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import type { ApprovalDomain } from '@/lib/approvals';

import { approveExpense, rejectExpense } from '@/lib/expenses';
import { approveCommitment, rejectCommitment } from '@/lib/commitments';
import { approveCustody, rejectCustody } from '@/lib/custodies';
import { approvePayroll, rejectPayroll } from '@/lib/payroll';
import { approveBilling, rejectBilling } from '@/lib/subcontractor-billings';

export type ApprovalActionResult =
  | { success: true; domain: ApprovalDomain; id: string }
  | {
      success: false;
      error: string;
      message: string;
      details?: Array<{ path: string; message: string }>;
    };

function handleUseCaseError(error: unknown): ApprovalActionResult {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'بيانات غير صالحة',
      details: error.details,
    };
  }
  if (error instanceof AppError) {
    return { success: false, error: error.code, message: error.message };
  }
  if (error instanceof PermissionError) {
    return { success: false, error: error.code, message: error.message };
  }
  if (error instanceof AuthError) {
    return { success: false, error: error.code, message: error.message };
  }
  const appErr = toAppError(error);
  return { success: false, error: appErr.code, message: appErr.message };
}

function validateId(id: string): ApprovalActionResult | null {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return { success: false, error: 'VALIDATION_ERROR', message: 'معرف المعاملة غير صالح' };
  }
  return null;
}

function validateRejectionReason(reason: string): ApprovalActionResult | null {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'سبب الرفض يجب أن يكون 3 أحرف على الأقل',
      details: [{ path: 'rejectionReason', message: 'سبب الرفض يجب أن يكون 3 أحرف على الأقل' }],
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// EXPENSE ACTIONS
// -----------------------------------------------------------------------------

export async function approveExpenseHubAction(id: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  try {
    await approveExpense(id);
    revalidatePath('/approvals');
    return { success: true, domain: 'EXPENSE', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

export async function rejectExpenseHubAction(id: string, reason: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  const reasonError = validateRejectionReason(reason);
  if (reasonError) return reasonError;

  try {
    await rejectExpense(id, { rejectionReason: reason });
    revalidatePath('/approvals');
    return { success: true, domain: 'EXPENSE', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

// -----------------------------------------------------------------------------
// COMMITMENT ACTIONS
// -----------------------------------------------------------------------------

export async function approveCommitmentHubAction(id: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  try {
    await approveCommitment(id);
    revalidatePath('/approvals');
    return { success: true, domain: 'COMMITMENT', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

export async function rejectCommitmentHubAction(id: string, reason: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  const reasonError = validateRejectionReason(reason);
  if (reasonError) return reasonError;

  try {
    await rejectCommitment(id, { rejectionReason: reason });
    revalidatePath('/approvals');
    return { success: true, domain: 'COMMITMENT', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

// -----------------------------------------------------------------------------
// CUSTODY ACTIONS
// -----------------------------------------------------------------------------

export async function approveCustodyHubAction(id: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  try {
    await approveCustody(id);
    revalidatePath('/approvals');
    return { success: true, domain: 'CUSTODY', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

export async function rejectCustodyHubAction(id: string, reason: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  const reasonError = validateRejectionReason(reason);
  if (reasonError) return reasonError;

  try {
    await rejectCustody({ id, rejectionReason: reason });
    revalidatePath('/approvals');
    return { success: true, domain: 'CUSTODY', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

// -----------------------------------------------------------------------------
// PAYROLL ACTIONS
// -----------------------------------------------------------------------------

export async function approvePayrollHubAction(id: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  try {
    await approvePayroll(id);
    revalidatePath('/approvals');
    return { success: true, domain: 'PAYROLL', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

export async function rejectPayrollHubAction(id: string, reason: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  const reasonError = validateRejectionReason(reason);
  if (reasonError) return reasonError;

  try {
    await rejectPayroll(id, { rejectionReason: reason });
    revalidatePath('/approvals');
    return { success: true, domain: 'PAYROLL', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

// -----------------------------------------------------------------------------
// SUBCONTRACTOR BILLING ACTIONS
// -----------------------------------------------------------------------------

export async function approveBillingHubAction(id: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  try {
    await approveBilling(id);
    revalidatePath('/approvals');
    return { success: true, domain: 'SUBCONTRACTOR_BILLING', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}

export async function rejectBillingHubAction(id: string, reason: string): Promise<ApprovalActionResult> {
  try {
    await requireManager();
  } catch (error) {
    return handleUseCaseError(error);
  }

  const idError = validateId(id);
  if (idError) return idError;

  const reasonError = validateRejectionReason(reason);
  if (reasonError) return reasonError;

  try {
    await rejectBilling(id, { rejectionReason: reason });
    revalidatePath('/approvals');
    return { success: true, domain: 'SUBCONTRACTOR_BILLING', id };
  } catch (error) {
    revalidatePath('/approvals');
    return handleUseCaseError(error);
  }
}
