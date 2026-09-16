/**
 * lib/budget/state-machine.ts
 *
 * Strict state machine for Project Budget lifecycle transitions (Version 1).
 *
 * Allowed transitions matrix:
 *   DRAFT     → SUBMITTED
 *   SUBMITTED → APPROVED, REJECTED
 *   REJECTED  → DRAFT (reopens the same record for edits)
 *   APPROVED  → (terminal — strictly immutable)
 *   SUPERSEDED→ (terminal — reserved for future revisions)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * See AGENTS.md §8 and Vertical Slice 3 specification.
 */

import { BudgetStatus } from '@prisma/client';

import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

const ALLOWED_BUDGET_TRANSITIONS: Readonly<Record<BudgetStatus, readonly BudgetStatus[]>> = {
  [BudgetStatus.DRAFT]: [BudgetStatus.SUBMITTED],
  [BudgetStatus.SUBMITTED]: [BudgetStatus.APPROVED, BudgetStatus.REJECTED],
  [BudgetStatus.REJECTED]: [BudgetStatus.DRAFT],
  [BudgetStatus.APPROVED]: [],
  [BudgetStatus.SUPERSEDED]: [],
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given status transition is allowed.
 *
 * @param from - Current budget status
 * @param to   - Desired next status
 */
export function canTransitionBudgetStatus(
  from: BudgetStatus,
  to: BudgetStatus,
): boolean {
  return (ALLOWED_BUDGET_TRANSITIONS[from] as readonly BudgetStatus[]).includes(to);
}

/**
 * Asserts that the budget transition is allowed.
 * Throws INVALID_STATE_TRANSITION if not.
 *
 * @param from - Current budget status
 * @param to   - Desired next status
 * @throws {AppError} INVALID_STATE_TRANSITION if the transition is not permitted
 */
export function assertCanTransitionBudgetStatus(
  from: BudgetStatus,
  to: BudgetStatus,
): void {
  if (!canTransitionBudgetStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة الموازنة "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given budget status can legally transition to.
 */
export function getAllowedNextBudgetStatuses(current: BudgetStatus): readonly BudgetStatus[] {
  return ALLOWED_BUDGET_TRANSITIONS[current];
}
