/**
 * lib/project-team/state-machine.ts
 *
 * Strict state machine for ProjectAssignment lifecycle transitions.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Allowed transitions matrix (per locked decision BD-11-03):
 *   ACTIVE   → INACTIVE
 *   INACTIVE → ACTIVE
 *
 * No other transitions are permitted.
 * Status must only change through this module.
 */

import { AssignmentStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

const ALLOWED_ASSIGNMENT_TRANSITIONS: Readonly<
  Record<AssignmentStatus, readonly AssignmentStatus[]>
> = {
  [AssignmentStatus.ACTIVE]: [AssignmentStatus.INACTIVE],
  [AssignmentStatus.INACTIVE]: [AssignmentStatus.ACTIVE],
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given assignment status transition is allowed.
 *
 * @param from - Current assignment status
 * @param to   - Desired next status
 */
export function canTransitionAssignmentStatus(
  from: AssignmentStatus,
  to: AssignmentStatus,
): boolean {
  return (ALLOWED_ASSIGNMENT_TRANSITIONS[from] as readonly AssignmentStatus[]).includes(to);
}

/**
 * Asserts that the transition is allowed.
 * Throws INVALID_STATE_TRANSITION if not.
 *
 * @param from - Current assignment status
 * @param to   - Desired next status
 * @throws {AppError} INVALID_STATE_TRANSITION if the transition is not permitted
 */
export function assertCanTransitionAssignmentStatus(
  from: AssignmentStatus,
  to: AssignmentStatus,
): void {
  if (!canTransitionAssignmentStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة التعيين "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns true if status is ACTIVE.
 */
export function isActiveAssignment(status: AssignmentStatus): boolean {
  return status === AssignmentStatus.ACTIVE;
}

/**
 * Returns true if status is INACTIVE.
 */
export function isInactiveAssignment(status: AssignmentStatus): boolean {
  return status === AssignmentStatus.INACTIVE;
}
