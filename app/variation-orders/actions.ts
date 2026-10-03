'use server';

/**
 * app/variation-orders/actions.ts
 *
 * Server Actions for Variation Orders (Slice 20).
 * Orchestrates use cases, manages cache revalidation, and centralizes error handling.
 *
 * Follows AGENTS.md §8, §13, §14, §26.
 */

import { revalidatePath } from 'next/cache';
import { handleActionError } from '@/lib/errors';
import {
  createVariationOrder,
  updateVariationOrder,
  deleteVariationOrder,
  submitVariationOrder,
  approveVariationOrder,
  rejectVariationOrder,
  reopenVariationOrder,
  type VariationOrderDetailDTO,
} from '@/lib/variation-orders';
import type {
  CreateVariationOrderInput,
  UpdateVariationOrderInput,
  SubmitVariationOrderInput,
  ApproveVariationOrderInput,
  RejectVariationOrderInput,
  ReopenVariationOrderInput,
} from '@/lib/validation/schemas/variation-order';

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export type ActionSuccess<T = VariationOrderDetailDTO> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = VariationOrderDetailDTO> =
  | ActionSuccess<T>
  | ActionFailure;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateVariationOrderPaths(projectId?: string): void {
  revalidatePath('/variation-orders');
  revalidatePath('/approvals');
  revalidatePath('/dashboard');
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/variation-orders`);
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function createVariationOrderAction(
  input: CreateVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await createVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'createVariationOrder' });
  }
}

export async function updateVariationOrderAction(
  input: UpdateVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await updateVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'updateVariationOrder', entityId: input.id });
  }
}

export async function deleteVariationOrderAction(
  id: string,
  projectId?: string,
): Promise<ActionResult<{ success: true; id: string }>> {
  try {
    const result = await deleteVariationOrder(id);
    revalidateVariationOrderPaths(projectId);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error, { actionName: 'deleteVariationOrder', entityId: id });
  }
}

export async function submitVariationOrderAction(
  input: SubmitVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await submitVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'submitVariationOrder', entityId: input.id });
  }
}

export async function approveVariationOrderAction(
  input: ApproveVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await approveVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'approveVariationOrder', entityId: input.id });
  }
}

export async function rejectVariationOrderAction(
  input: RejectVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await rejectVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'rejectVariationOrder', entityId: input.id });
  }
}

export async function reopenVariationOrderAction(
  input: ReopenVariationOrderInput,
): Promise<ActionResult<VariationOrderDetailDTO>> {
  try {
    const vo = await reopenVariationOrder(input);
    revalidateVariationOrderPaths(vo.projectId);
    return { success: true, data: vo };
  } catch (error) {
    return handleActionError(error, { actionName: 'reopenVariationOrder', entityId: input.id });
  }
}
