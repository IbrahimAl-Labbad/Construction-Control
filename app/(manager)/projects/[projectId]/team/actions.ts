'use server';

/**
 * app/(manager)/projects/[projectId]/team/actions.ts
 *
 * Server Actions for Project Team & Engineer Assignment operations.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
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
  assignEngineerToProject,
  removeEngineerFromProject,
  type ProjectTeamMemberDTO,
} from '@/lib/project-team';

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

export type ActionResult<T = ProjectTeamMemberDTO> = ActionSuccess<T> | ActionFailure;

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
      message: 'ليس لديك الصلاحية لتنفيذ هذا الإجراء',
    };
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: error.code,
      message: 'جلسة العمل غير صالحة أو منتهية',
    };
  }

  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.',
  };
}

export async function assignEngineerAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectTeamMemberDTO>> {
  try {
    const engineerId = formData.get('engineerId');
    const reason = formData.get('reason');

    const result = await assignEngineerToProject({
      projectId,
      engineerId: typeof engineerId === 'string' ? engineerId : '',
      reason: typeof reason === 'string' ? reason : null,
    });

    revalidatePath(`/projects/${projectId}/team`);
    revalidatePath(`/projects/${projectId}`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function removeEngineerAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectTeamMemberDTO>> {
  try {
    const assignmentId = formData.get('assignmentId');
    const reason = formData.get('reason');

    const result = await removeEngineerFromProject({
      projectId,
      assignmentId: typeof assignmentId === 'string' ? assignmentId : '',
      reason: typeof reason === 'string' ? reason : null,
    });

    revalidatePath(`/projects/${projectId}/team`);
    revalidatePath(`/projects/${projectId}`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
