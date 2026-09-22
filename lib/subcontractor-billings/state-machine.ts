/**
 * lib/subcontractor-billings/state-machine.ts
 *
 * Strict state machine for Subcontractor Billing lifecycle transitions.
 * Client-safe — no database or server-only runtime dependencies.
 *
 * Allowed transitions matrix:
 *   DRAFT     → SUBMITTED
 *   DRAFT     → CANCELLED  (Accountant voids before submission)
 *   SUBMITTED → APPROVED
 *   SUBMITTED → REJECTED
 *   SUBMITTED → CANCELLED  (Manager voids after submission)
 *   REJECTED  → DRAFT      (Accountant reopens same record for edits)
 *   APPROVED  → (terminal — strictly immutable, AGENTS.md §13)
 *   CANCELLED → (terminal)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * Follows AGENTS.md §8 and Vertical Slice 7 specification.
 */

import { SubcontractorBillingStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_BILLING_TRANSITIONS: Readonly<
  Record<SubcontractorBillingStatus, readonly SubcontractorBillingStatus[]>
> = {
  [SubcontractorBillingStatus.DRAFT]: [
    SubcontractorBillingStatus.SUBMITTED,
    SubcontractorBillingStatus.CANCELLED,
  ],
  [SubcontractorBillingStatus.SUBMITTED]: [
    SubcontractorBillingStatus.APPROVED,
    SubcontractorBillingStatus.REJECTED,
    SubcontractorBillingStatus.CANCELLED,
  ],
  [SubcontractorBillingStatus.REJECTED]: [
    SubcontractorBillingStatus.DRAFT, // reopen — same record
  ],
  [SubcontractorBillingStatus.APPROVED]: [], // Terminal — strictly immutable
  [SubcontractorBillingStatus.CANCELLED]: [], // Terminal
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given billing status transition is allowed.
 */
export function canTransitionBillingStatus(
  from: SubcontractorBillingStatus,
  to: SubcontractorBillingStatus,
): boolean {
  return (
    ALLOWED_BILLING_TRANSITIONS[from] as readonly SubcontractorBillingStatus[]
  ).includes(to);
}

/**
 * Asserts that the billing status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if the transition is not permitted.
 */
export function assertCanTransitionBillingStatus(
  from: SubcontractorBillingStatus,
  to: SubcontractorBillingStatus,
): void {
  if (!canTransitionBillingStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة المستخلص "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given billing status can legally transition to.
 */
export function getAllowedNextBillingStatuses(
  current: SubcontractorBillingStatus,
): readonly SubcontractorBillingStatus[] {
  return ALLOWED_BILLING_TRANSITIONS[current];
}
