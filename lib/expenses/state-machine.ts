/**
 * lib/expenses/state-machine.ts
 *
 * Strict state machine for Project Expense lifecycle transitions.
 *
 * Allowed transitions matrix:
 *   DRAFT     → SUBMITTED
 *   SUBMITTED → APPROVED, REJECTED
 *   REJECTED  → DRAFT (reopens the same record for edits)
 *   APPROVED  → (terminal — strictly immutable)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * See AGENTS.md §8 and Vertical Slice 4 specification.
 */

import { ExpenseStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_EXPENSE_TRANSITIONS: Readonly<
  Record<ExpenseStatus, readonly ExpenseStatus[]>
> = {
  [ExpenseStatus.DRAFT]: [ExpenseStatus.SUBMITTED],
  [ExpenseStatus.SUBMITTED]: [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED],
  [ExpenseStatus.REJECTED]: [ExpenseStatus.DRAFT],
  [ExpenseStatus.APPROVED]: [], // Terminal — strictly immutable
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given expense status transition is allowed.
 */
export function canTransitionExpenseStatus(
  from: ExpenseStatus,
  to: ExpenseStatus,
): boolean {
  return (ALLOWED_EXPENSE_TRANSITIONS[from] as readonly ExpenseStatus[]).includes(to);
}

/**
 * Asserts that the expense status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if not.
 */
export function assertCanTransitionExpenseStatus(
  from: ExpenseStatus,
  to: ExpenseStatus,
): void {
  if (!canTransitionExpenseStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة المصروف "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given expense status can legally transition to.
 */
export function getAllowedNextExpenseStatuses(
  current: ExpenseStatus,
): readonly ExpenseStatus[] {
  return ALLOWED_EXPENSE_TRANSITIONS[current];
}
