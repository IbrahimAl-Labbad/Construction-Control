/**
 * lib/projects/state-machine.ts
 *
 * Strict state machine for Project lifecycle transitions.
 *
 * Allowed transitions matrix (per AGENTS.md design approval):
 *   PLANNED  → ACTIVE, CANCELLED
 *   ACTIVE   → ON_HOLD, COMPLETED, CANCELLED
 *   ON_HOLD  → ACTIVE, CANCELLED
 *   COMPLETED → (terminal — no transitions)
 *   CANCELLED → (terminal — no transitions)
 *
 * Status must only change through this module.
 * General project update use case must NOT touch status directly.
 *
 * See AGENTS.md §8 (Use Cases) and design approval constraints §4.
 */

import { ProjectStatus } from '@prisma/client';

import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  [ProjectStatus.PLANNED]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ACTIVE]: [
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ],
  [ProjectStatus.ON_HOLD]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [],
  [ProjectStatus.CANCELLED]: [],
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given status transition is allowed.
 *
 * @param from - Current project status
 * @param to   - Desired next status
 */
export function canTransitionProjectStatus(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly ProjectStatus[]).includes(to);
}

/**
 * Asserts that the transition is allowed.
 * Throws INVALID_STATE_TRANSITION if not.
 *
 * @param from - Current project status
 * @param to   - Desired next status
 * @throws {AppError} INVALID_STATE_TRANSITION if the transition is not permitted
 */
export function assertCanTransitionProjectStatus(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (!canTransitionProjectStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من الحالة "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given status can legally transition to.
 *
 * Used by the UI to show only valid next states.
 */
export function getAllowedNextStatuses(current: ProjectStatus): readonly ProjectStatus[] {
  return ALLOWED_TRANSITIONS[current];
}
