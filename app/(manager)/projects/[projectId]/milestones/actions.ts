'use server';

/**
 * app/(manager)/projects/[projectId]/milestones/actions.ts
 *
 * Server Actions for Project Planning & Milestones operations.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and domain rules to application use cases.
 * - Maps use case errors to structured, client-safe action results.
 * - Revalidates affected Next.js paths.
 */

import { revalidatePath } from 'next/cache';
import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import {
  createMilestone,
  updateMilestone,
  startMilestone,
  completeMilestone,
  cancelMilestone,
  deleteMilestone,
  reorderProjectMilestones,
  type ProjectMilestoneDTO,
} from '@/lib/milestones';

export type ActionSuccess<T> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = ProjectMilestoneDTO> = ActionSuccess<T> | ActionFailure;

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
      message: 'ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء',
    };
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
    };
  }

  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  };
}

export async function createMilestoneAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      projectId,
      title: formData.get('title'),
      description: formData.get('description'),
      targetDate: formData.get('targetDate'),
    };

    const created = await createMilestone(rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: created,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function updateMilestoneAction(
  projectId: string,
  milestoneId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      title: formData.get('title') || undefined,
      description: formData.get('description'),
      targetDate: formData.get('targetDate') || undefined,
    };

    const updated = await updateMilestone(milestoneId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function startMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const started = await startMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: started,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function completeMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const completed = await completeMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: completed,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function cancelMilestoneAction(
  projectId: string,
  milestoneId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      cancellationReason: formData.get('cancellationReason'),
    };

    const cancelled = await cancelMilestone(milestoneId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: cancelled,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function deleteMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<{ success: true }>> {
  try {
    const result = await deleteMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function reorderMilestonesAction(
  projectId: string,
  milestoneIds: string[],
): Promise<ActionResult<ProjectMilestoneDTO[]>> {
  try {
    const reordered = await reorderProjectMilestones({
      projectId,
      milestoneIds,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: reordered,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
