/**
 * lib/commitments/state-machine.ts
 *
 * Strict state machine for Project Commitment lifecycle transitions.
 *
 * Allowed transitions matrix:
 *   DRAFT     → SUBMITTED
 *   SUBMITTED → APPROVED, REJECTED
 *   REJECTED  → DRAFT (reopens the same record for edits)
 *   APPROVED  → (terminal — strictly immutable)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * Follows AGENTS.md §8 and Vertical Slice 5 specification.
 */

import { CommitmentStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_COMMITMENT_TRANSITIONS: Readonly<
  Record<CommitmentStatus, readonly CommitmentStatus[]>
> = {
  [CommitmentStatus.DRAFT]: [CommitmentStatus.SUBMITTED],
  [CommitmentStatus.SUBMITTED]: [CommitmentStatus.APPROVED, CommitmentStatus.REJECTED],
  [CommitmentStatus.REJECTED]: [CommitmentStatus.DRAFT],
  [CommitmentStatus.APPROVED]: [], // Terminal — strictly immutable
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given commitment status transition is allowed.
 */
export function canTransitionCommitmentStatus(
  from: CommitmentStatus,
  to: CommitmentStatus,
): boolean {
  return (ALLOWED_COMMITMENT_TRANSITIONS[from] as readonly CommitmentStatus[]).includes(to);
}

/**
 * Asserts that the commitment status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if not.
 */
export function assertCanTransitionCommitmentStatus(
  from: CommitmentStatus,
  to: CommitmentStatus,
): void {
  if (!canTransitionCommitmentStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة الالتزام "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given commitment status can legally transition to.
 */
export function getAllowedNextCommitmentStatuses(
  current: CommitmentStatus,
): readonly CommitmentStatus[] {
  return ALLOWED_COMMITMENT_TRANSITIONS[current];
}
