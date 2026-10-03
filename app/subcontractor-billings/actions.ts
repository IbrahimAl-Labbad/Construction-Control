'use server';

/**
 * app/subcontractor-billings/actions.ts
 *
 * Server Actions for Subcontractor Billing (Create Draft, Update Draft, Delete Draft,
 * Submit, Approve, Reject, Reopen, Cancel).
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and domain rules to use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never leaks internal database errors or server-only instances to client.
 */

import { revalidatePath } from 'next/cache';

import { handleActionError } from '@/lib/errors';
import {
  createBillingDraft,
  updateBillingDraft,
  deleteBillingDraft,
  submitBilling,
  approveBilling,
  rejectBilling,
  reopenBilling,
  cancelBilling,
  type SubcontractorBillingSummaryDTO,
} from '@/lib/subcontractor-billings';
import type {
  CreateBillingDraftInput,
  UpdateBillingDraftInput,
  RejectBillingInput,
  CancelBillingInput,
} from '@/lib/validation/schemas/subcontractor-billing';

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

export type ActionSuccess<T = SubcontractorBillingSummaryDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = SubcontractorBillingSummaryDTO> =
  | ActionSuccess<T>
  | ActionFailure;

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleUseCaseError(error: unknown): ActionFailure {
  return handleActionError(error);
}

// ---------------------------------------------------------------------------
// Path revalidation helper
// ---------------------------------------------------------------------------

function revalidateBillingPaths(projectId?: string): void {
  revalidatePath('/subcontractor-billings');
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/billings`);
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Creates a new subcontractor billing draft.
 * Only ACCOUNTANT role is authorized (enforced in use-case).
 */
export async function createBillingDraftAction(
  input: CreateBillingDraftInput,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await createBillingDraft(input);
    revalidateBillingPaths(billing.projectId);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Updates an existing draft billing record.
 * Only the creating ACCOUNTANT may update (enforced in use-case).
 */
export async function updateBillingDraftAction(
  billingId: string,
  input: UpdateBillingDraftInput,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await updateBillingDraft(billingId, input);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Hard-deletes a draft billing record.
 * Only the creating ACCOUNTANT may delete (enforced in use-case).
 */
export async function deleteBillingDraftAction(
  billingId: string,
): Promise<ActionResult<{ deleted: true; id: string }>> {
  try {
    await deleteBillingDraft(billingId);
    revalidateBillingPaths();
    return { success: true, data: { deleted: true, id: billingId } };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Submits a billing draft for Manager approval.
 * Only the creating ACCOUNTANT may submit (enforced in use-case).
 */
export async function submitBillingAction(
  billingId: string,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await submitBilling(billingId);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Approves a submitted billing claim. MANAGER only (enforced in use-case).
 */
export async function approveBillingAction(
  billingId: string,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await approveBilling(billingId);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Rejects a submitted billing claim with a written reason. MANAGER only (enforced in use-case).
 */
export async function rejectBillingAction(
  billingId: string,
  input: RejectBillingInput,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await rejectBilling(billingId, input);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Reopens a REJECTED billing draft back to DRAFT for corrections.
 * ACCOUNTANT (creator) only (enforced in use-case).
 */
export async function reopenBillingAction(
  billingId: string,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await reopenBilling(billingId);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

/**
 * Cancels a DRAFT or SUBMITTED billing. MANAGER only (enforced in use-case).
 * APPROVED billings cannot be cancelled.
 */
export async function cancelBillingAction(
  billingId: string,
  input?: CancelBillingInput,
): Promise<ActionResult<SubcontractorBillingSummaryDTO>> {
  try {
    const billing = await cancelBilling(billingId, input);
    revalidateBillingPaths(billing.projectId);
    revalidatePath(`/subcontractor-billings/${billingId}`);
    return { success: true, data: billing };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
