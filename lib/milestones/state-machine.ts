/**
 * lib/milestones/state-machine.ts
 *
 * Strict state machine for Project Milestone lifecycle transitions.
 * Client-safe — no database or server-only runtime dependencies.
 *
 * Allowed transitions matrix (Section 4 & 6 of specification):
 *   PLANNED     → IN_PROGRESS
 *   PLANNED     → COMPLETED
 *   PLANNED     → CANCELLED
 *   IN_PROGRESS → COMPLETED
 *   IN_PROGRESS → CANCELLED
 *   COMPLETED   → (terminal — strictly immutable)
 *   CANCELLED   → (terminal — strictly immutable)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * Follows AGENTS.md §8 and Vertical Slice 12 specification.
 */

import { MilestoneStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition Matrix (Typed for Exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_MILESTONE_TRANSITIONS: Readonly<
  Record<MilestoneStatus, readonly MilestoneStatus[]>
> = {
  [MilestoneStatus.PLANNED]: [
    MilestoneStatus.IN_PROGRESS,
    MilestoneStatus.COMPLETED,
    MilestoneStatus.CANCELLED,
  ],
  [MilestoneStatus.IN_PROGRESS]: [
    MilestoneStatus.COMPLETED,
    MilestoneStatus.CANCELLED,
  ],
  [MilestoneStatus.COMPLETED]: [], // Terminal — strictly immutable
  [MilestoneStatus.CANCELLED]: [], // Terminal — strictly immutable
} as const;

// ---------------------------------------------------------------------------
// Public State-Machine Queries & Guards
// ---------------------------------------------------------------------------

/**
 * Returns true if the given milestone status transition is allowed.
 */
export function canTransitionMilestoneStatus(
  from: MilestoneStatus,
  to: MilestoneStatus,
): boolean {
  return (
    ALLOWED_MILESTONE_TRANSITIONS[from] as readonly MilestoneStatus[]
  ).includes(to);
}

/**
 * Asserts that the milestone status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if the transition is not permitted.
 */
export function assertCanTransitionMilestoneStatus(
  from: MilestoneStatus,
  to: MilestoneStatus,
): void {
  if (!canTransitionMilestoneStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة المحطة "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given milestone status can legally transition to.
 */
export function getAllowedNextMilestoneStatuses(
  current: MilestoneStatus,
): readonly MilestoneStatus[] {
  return ALLOWED_MILESTONE_TRANSITIONS[current];
}

/**
 * Returns true if the milestone metadata can be edited in its current status.
 * Invariant: only PLANNED and IN_PROGRESS records can have their metadata modified (BD-12-08).
 */
export function isEditableMilestoneStatus(status: MilestoneStatus): boolean {
  return (
    status === MilestoneStatus.PLANNED ||
    status === MilestoneStatus.IN_PROGRESS
  );
}

/**
 * Returns true if the milestone status is terminal (cannot transition further).
 * Invariant: COMPLETED and CANCELLED are terminal states (BD-12-16).
 */
export function isTerminalMilestoneStatus(status: MilestoneStatus): boolean {
  return (
    status === MilestoneStatus.COMPLETED ||
    status === MilestoneStatus.CANCELLED
  );
}

/**
 * Returns true if the milestone can be soft-deleted in its current status.
 * Invariant: only PLANNED records can be soft-deleted (BD-12-05).
 * IN_PROGRESS, COMPLETED, CANCELLED cannot be soft-deleted.
 */
export function canSoftDeleteMilestoneStatus(status: MilestoneStatus): boolean {
  return status === MilestoneStatus.PLANNED;
}
