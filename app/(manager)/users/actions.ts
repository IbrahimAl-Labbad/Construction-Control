'use server';

/**
 * app/(manager)/users/actions.ts
 *
 * Server Actions for user management operations.
 *
 * Responsibilities of this layer:
 *   - Parse and extract raw inputs from FormData or typed parameters
 *   - Delegate ALL authorization and validation to use cases
 *   - Map use-case errors to structured, client-safe action results
 *   - NEVER return passwordHash, session tokens, or internal error details
 *
 * The use cases are the authoritative layer for authorization and validation.
 * Do not duplicate business logic here.
 *
 * See AGENTS.md §7 for API/server layer rules.
 * See AGENTS.md §17 for security rules.
 */

import { handleActionError } from '@/lib/errors';
import { createUser, deactivateUser, reactivateUser } from '@/lib/user-management';

import type { UserSummary } from '@/lib/user-management';

// ---------------------------------------------------------------------------
// Action result type
// ---------------------------------------------------------------------------

export type ActionSuccess<T = UserSummary> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = UserSummary> = ActionSuccess<T> | ActionFailure;

// ---------------------------------------------------------------------------
// Error mapper — converts use-case errors to safe client responses
// ---------------------------------------------------------------------------

function handleUseCaseError(error: unknown): ActionFailure {
  return handleActionError(error, 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
}

// ---------------------------------------------------------------------------
// Create user action
// ---------------------------------------------------------------------------

/**
 * Creates a new user account.
 *
 * Extracts fields from FormData and delegates to the createUser use case.
 * The use case performs all authorization and validation.
 *
 * @param formData - Form data from the create user form
 */
export async function createUserAction(formData: FormData): Promise<ActionResult> {
  try {
    // Extract raw values — validation is done inside the use case
    const rawInput = {
      name: formData.get('name'),
      email: formData.get('email'),
      role: formData.get('role'),
      password: formData.get('password'),
    };

    const user = await createUser(rawInput);
    return { success: true, data: user };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Deactivate user action
// ---------------------------------------------------------------------------

/**
 * Deactivates a user account.
 *
 * Delegates to the deactivateUser use case, which enforces:
 * - MANAGER authorization
 * - Self-deactivation guard
 * - Soft-deleted user exclusion
 *
 * @param userId - The ID of the user to deactivate
 */
export async function deactivateUserAction(userId: string): Promise<ActionResult> {
  try {
    const user = await deactivateUser(userId);
    return { success: true, data: user };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Reactivate user action
// ---------------------------------------------------------------------------

/**
 * Reactivates a previously deactivated user account.
 *
 * Delegates to the reactivateUser use case, which enforces:
 * - MANAGER authorization
 * - Soft-deleted user exclusion (only deactivated users can be reactivated)
 *
 * @param userId - The ID of the user to reactivate
 */
export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  try {
    const user = await reactivateUser(userId);
    return { success: true, data: user };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
