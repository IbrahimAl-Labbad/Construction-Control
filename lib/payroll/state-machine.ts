/**
 * lib/payroll/state-machine.ts
 *
 * Strict state machine for Payroll Entry lifecycle transitions.
 * Client-safe — no database or server-only runtime dependencies.
 *
 * Allowed transitions matrix:
 *   DRAFT     → SUBMITTED
 *   DRAFT     → CANCELLED  (Accountant voids draft before submission, or Manager voids)
 *   SUBMITTED → APPROVED   (Manager approves labor cost entry)
 *   SUBMITTED → REJECTED   (Manager rejects back to Accountant for correction)
 *   SUBMITTED → CANCELLED  (Manager voids submitted entry)
 *   REJECTED  → DRAFT      (Accountant reopens same record for edits)
 *   APPROVED  → (terminal — strictly immutable financial ledger record, AGENTS.md §13)
 *   CANCELLED → (terminal)
 *
 * Direct mutations or bypasses of this state machine are strictly prohibited.
 * Follows AGENTS.md §8 and Vertical Slice 8 specification.
 */

import { PayrollStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition matrix (typed for exhaustiveness)
// ---------------------------------------------------------------------------

export const ALLOWED_PAYROLL_TRANSITIONS: Readonly<
  Record<PayrollStatus, readonly PayrollStatus[]>
> = {
  [PayrollStatus.DRAFT]: [
    PayrollStatus.SUBMITTED,
    PayrollStatus.CANCELLED,
  ],
  [PayrollStatus.SUBMITTED]: [
    PayrollStatus.APPROVED,
    PayrollStatus.REJECTED,
    PayrollStatus.CANCELLED,
  ],
  [PayrollStatus.REJECTED]: [
    PayrollStatus.DRAFT, // reopen — same record for editing
  ],
  [PayrollStatus.APPROVED]: [], // Terminal — strictly immutable
  [PayrollStatus.CANCELLED]: [], // Terminal
} as const;

// ---------------------------------------------------------------------------
// Public State-Machine Queries & Guards
// ---------------------------------------------------------------------------

/**
 * Returns true if the given payroll status transition is allowed.
 */
export function canTransitionPayrollStatus(
  from: PayrollStatus,
  to: PayrollStatus,
): boolean {
  return (
    ALLOWED_PAYROLL_TRANSITIONS[from] as readonly PayrollStatus[]
  ).includes(to);
}

/**
 * Asserts that the payroll status transition is allowed.
 * Throws INVALID_STATE_TRANSITION if the transition is not permitted.
 */
export function assertValidPayrollTransition(
  from: PayrollStatus,
  to: PayrollStatus,
): void {
  if (!canTransitionPayrollStatus(from, to)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن الانتقال من حالة قيد الراتب "${from}" إلى الحالة "${to}"`,
    );
  }
}

/**
 * Returns the list of statuses that the given payroll status can legally transition to.
 */
export function getAllowedNextPayrollStatuses(
  current: PayrollStatus,
): readonly PayrollStatus[] {
  return ALLOWED_PAYROLL_TRANSITIONS[current];
}

/**
 * Returns true if the payroll entry can be edited in its current status.
 * Invariant: only DRAFT records can be modified.
 */
export function isEditablePayrollStatus(status: PayrollStatus): boolean {
  return status === PayrollStatus.DRAFT;
}

/**
 * Returns true if the status is terminal (cannot transition further).
 * Invariant: APPROVED and CANCELLED are terminal states.
 */
export function isTerminalPayrollStatus(status: PayrollStatus): boolean {
  return (
    status === PayrollStatus.APPROVED || status === PayrollStatus.CANCELLED
  );
}

// ---------------------------------------------------------------------------
// Domain Invariant Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that a payroll entry is in editable status (DRAFT).
 * Throws RECORD_NOT_EDITABLE if not.
 */
export function assertPayrollIsEditable(status: PayrollStatus): void {
  if (!isEditablePayrollStatus(status)) {
    throw new AppError(
      'RECORD_NOT_EDITABLE',
      `لا يمكن تعديل قيد الراتب في الحالة الحالية: "${status}". التعديل متاح فقط في حالة المسودة (DRAFT)`,
    );
  }
}

/**
 * Asserts that a payroll entry is in a state where it can be approved (SUBMITTED).
 * Throws INVALID_STATE_TRANSITION if not.
 */
export function assertPayrollCanBeApproved(status: PayrollStatus): void {
  if (status !== PayrollStatus.SUBMITTED) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن اعتماد قيد الراتب إلا عندما يكون في حالة مقدم (SUBMITTED). الحالة الحالية: "${status}"`,
    );
  }
}

/**
 * Asserts that a payroll entry is in a state where it can be rejected (SUBMITTED).
 * Throws INVALID_STATE_TRANSITION if not.
 */
export function assertPayrollCanBeRejected(status: PayrollStatus): void {
  if (status !== PayrollStatus.SUBMITTED) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن رفض قيد الراتب إلا عندما يكون في حالة مقدم (SUBMITTED). الحالة الحالية: "${status}"`,
    );
  }
}

/**
 * Asserts that a payroll entry is in a state where it can be cancelled (DRAFT or SUBMITTED).
 * Throws INVALID_STATE_TRANSITION if not.
 */
export function assertPayrollCanBeCancelled(status: PayrollStatus): void {
  if (
    status !== PayrollStatus.DRAFT &&
    status !== PayrollStatus.SUBMITTED
  ) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن إلغاء قيد الراتب في الحالة الحالية: "${status}". الإلغاء متاح فقط للمسودات (DRAFT) أو القيود المقدمة (SUBMITTED)`,
    );
  }
}
