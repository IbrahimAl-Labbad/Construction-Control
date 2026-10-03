'use server';

/**
 * app/(manager)/projects/actions.ts
 *
 * Server Actions for project management operations.
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and validation to use cases.
 * - Maps use-case errors to structured, client-safe action results.
 * - Never returns internal database errors or stack traces.
 */

import { handleActionError } from '@/lib/errors';
import {
  createProject,
  updateProject,
  changeProjectStatus,
  assignProjectManager,
  type ProjectSummary,
} from '@/lib/projects';

// ---------------------------------------------------------------------------
// Action result types
// ---------------------------------------------------------------------------

export type ActionSuccess<T = ProjectSummary> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = ProjectSummary> = ActionSuccess<T> | ActionFailure;

// ---------------------------------------------------------------------------
// Error mapper
// ---------------------------------------------------------------------------

function handleUseCaseError(error: unknown): ActionFailure {
  return handleActionError(error, 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
}

// ---------------------------------------------------------------------------
// Phase A: Create project action
// ---------------------------------------------------------------------------

/**
 * Server action to create a new project.
 *
 * @param formData - Form data from client
 */
export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult<ProjectSummary>> {
  try {
    const rawInput = {
      code: formData.get('code'),
      name: formData.get('name'),
      description: formData.get('description'),
      location: formData.get('location'),
      managerId: formData.get('managerId'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
    };

    const project = await createProject(rawInput);
    return { success: true, data: project };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Phase B: Update project metadata action
// ---------------------------------------------------------------------------

/**
 * Server action to update project metadata (name, description, location, dates).
 * Status cannot be changed via this action.
 *
 * @param projectId - The CUID of the project
 * @param formData  - Form data from client
 */
export async function updateProjectAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectSummary>> {
  try {
    const rawInput = {
      name: formData.get('name'),
      description: formData.get('description'),
      location: formData.get('location'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      reason: formData.get('reason'),
    };

    const project = await updateProject(projectId, rawInput);
    return { success: true, data: project };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Phase B: Change project status action
// ---------------------------------------------------------------------------

/**
 * Server action to change the lifecycle status of a project.
 * Strictly enforces the state machine transition rules.
 *
 * @param projectId - The CUID of the project
 * @param formData  - Form data with { newStatus, reason? }
 */
export async function changeProjectStatusAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectSummary>> {
  try {
    const rawInput = {
      newStatus: formData.get('newStatus'),
      reason: formData.get('reason'),
    };

    const project = await changeProjectStatus(projectId, rawInput);
    return { success: true, data: project };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Phase B: Assign project manager action
// ---------------------------------------------------------------------------

/**
 * Server action to re-assign the responsible manager for a project.
 *
 * @param projectId - The CUID of the project
 * @param formData  - Form data with { newManagerId, reason? }
 */
export async function assignProjectManagerAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectSummary>> {
  try {
    const rawInput = {
      newManagerId: formData.get('newManagerId'),
      reason: formData.get('reason'),
    };

    const project = await assignProjectManager(projectId, rawInput);
    return { success: true, data: project };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
