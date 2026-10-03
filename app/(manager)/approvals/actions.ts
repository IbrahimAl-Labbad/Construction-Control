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
import { handleActionError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
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
  return handleActionError(error, 'حدث خطأ غير متوقع');
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
// Cache revalidation helper
// -----------------------------------------------------------------------------

function revalidateApprovalHub(domainPath: string): void {
  revalidatePath('/approvals');
  revalidatePath('/dashboard');
  revalidatePath(domainPath);
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
    revalidateApprovalHub('/expenses');
    return { success: true, domain: 'EXPENSE', id };
  } catch (error) {
    revalidateApprovalHub('/expenses');
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
    revalidateApprovalHub('/expenses');
    return { success: true, domain: 'EXPENSE', id };
  } catch (error) {
    revalidateApprovalHub('/expenses');
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
    revalidateApprovalHub('/commitments');
    return { success: true, domain: 'COMMITMENT', id };
  } catch (error) {
    revalidateApprovalHub('/commitments');
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
    revalidateApprovalHub('/commitments');
    return { success: true, domain: 'COMMITMENT', id };
  } catch (error) {
    revalidateApprovalHub('/commitments');
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
    revalidateApprovalHub('/custodies');
    return { success: true, domain: 'CUSTODY', id };
  } catch (error) {
    revalidateApprovalHub('/custodies');
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
    revalidateApprovalHub('/custodies');
    return { success: true, domain: 'CUSTODY', id };
  } catch (error) {
    revalidateApprovalHub('/custodies');
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
    revalidateApprovalHub('/payroll');
    return { success: true, domain: 'PAYROLL', id };
  } catch (error) {
    revalidateApprovalHub('/payroll');
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
    revalidateApprovalHub('/payroll');
    return { success: true, domain: 'PAYROLL', id };
  } catch (error) {
    revalidateApprovalHub('/payroll');
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
    revalidateApprovalHub('/subcontractor-billings');
    return { success: true, domain: 'SUBCONTRACTOR_BILLING', id };
  } catch (error) {
    revalidateApprovalHub('/subcontractor-billings');
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
    revalidateApprovalHub('/subcontractor-billings');
    return { success: true, domain: 'SUBCONTRACTOR_BILLING', id };
  } catch (error) {
    revalidateApprovalHub('/subcontractor-billings');
    return handleUseCaseError(error);
  }
}

