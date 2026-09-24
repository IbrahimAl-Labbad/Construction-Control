/**
 * lib/progress-reports/state-machine.ts
 *
 * Strict state machine for Site Engineer Progress Report lifecycle transitions.
 * Client-safe — no database or server-only runtime dependencies.
 *
 * Allowed transitions matrix (BD-06, BD-07, BD-08):
 *   DRAFT     → SUBMITTED
 *   DRAFT     → CANCELLED   (Engineer cancels own draft, or Manager voids)
 *   SUBMITTED → APPROVED    (Manager approves report — strictly immutable)
 *   SUBMITTED → REJECTED    (Manager rejects report back to Engineer)
 *   SUBMITTED → CANCELLED   (Manager voids submitted report)
 *   REJECTED  → DRAFT       (Engineer reopens same record for edits)
 *   APPROVED  → (terminal — strictly immutable operational record)
 *   CANCELLED → (terminal — permanently retains uniqueness slot)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * Follows AGENTS.md §8 and Vertical Slice 10 specification.
 */

import { ProgressReportStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition Matrix (Typed for Exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_PROGRESS_REPORT_TRANSITIONS: Readonly<
  Record<ProgressReportStatus, readonly ProgressReportStatus[]>
> = {
  [ProgressReportStatus.DRAFT]: [
    ProgressReportStatus.SUBMITTED,
    ProgressReportStatus.CANCELLED,
  ],
  [ProgressReportStatus.SUBMITTED]: [
    ProgressReportStatus.APPROVED,
    ProgressReportStatus.REJECTED,
    ProgressReportStatus.CANCELLED,
  ],
  [ProgressReportStatus.REJECTED]: [
    ProgressReportStatus.DRAFT, // reopen — same record for editing
  ],
  [ProgressReportStatus.APPROVED]: [], // Terminal — strictly immutable
  [ProgressReportStatus.CANCELLED]: [], // Terminal — occupies uniqueness slot permanently
} as const;

// ---------------------------------------------------------------------------
// Public State-Machine Queries & Guards
// ---------------------------------------------------------------------------

/**
 * Returns true if the given progress report status transition is allowed.
 */
export function canTransitionProgressReportStatus(
  from: ProgressReportStatus,
  to: ProgressReportStatus,
): boolean {
  return (
    ALLOWED_PROGRESS_REPORT_TRANSITIONS[from] as readonly ProgressReportStatus[]
  ).includes(to);
}

/**
 * Asserts that the progress report status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if the transition is not permitted.
 */
export function assertValidProgressReportTransition(
  from: ProgressReportStatus,
  to: ProgressReportStatus,
): void {
  if (!canTransitionProgressReportStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة تقرير التقدم "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given progress report status can legally transition to.
 */
export function getAllowedNextProgressReportStatuses(
  current: ProgressReportStatus,
): readonly ProgressReportStatus[] {
  return ALLOWED_PROGRESS_REPORT_TRANSITIONS[current];
}

/**
 * Returns true if the progress report can be edited in its current status.
 * Invariant: only DRAFT records can be modified (BD-07).
 */
export function isEditableProgressReportStatus(
  status: ProgressReportStatus,
): boolean {
  return status === ProgressReportStatus.DRAFT;
}

/**
 * Returns true if the status is terminal (cannot transition further).
 * Invariant: APPROVED and CANCELLED are terminal states (BD-06, BD-08).
 */
export function isTerminalProgressReportStatus(
  status: ProgressReportStatus,
): boolean {
  return (
    status === ProgressReportStatus.APPROVED ||
    status === ProgressReportStatus.CANCELLED
  );
}
