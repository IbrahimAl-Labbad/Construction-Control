/**
 * lib/variation-orders/state-machine.ts
 *
 * Deterministic lifecycle state machine for Variation Orders / Change Orders (Slice 20).
 *
 * Lifecycle:
 *   DRAFT → SUBMITTED → APPROVED (strictly immutable)
 *          SUBMITTED → REJECTED → DRAFT (reopened / editable) → SUBMITTED
 *
 * All state transitions must be validated through this module.
 * No raw status mutations are permitted anywhere in the system.
 * Follows AGENTS.md §8, §9, §13.
 */

import { VariationOrderStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Transition Table
// ---------------------------------------------------------------------------

export const ALLOWED_VARIATION_ORDER_TRANSITIONS: Record<
  VariationOrderStatus,
  readonly VariationOrderStatus[]
> = {
  [VariationOrderStatus.DRAFT]: [VariationOrderStatus.SUBMITTED],
  [VariationOrderStatus.SUBMITTED]: [
    VariationOrderStatus.APPROVED,
    VariationOrderStatus.REJECTED,
  ],
  [VariationOrderStatus.REJECTED]: [VariationOrderStatus.DRAFT],
  // APPROVED is strictly immutable and terminal
  [VariationOrderStatus.APPROVED]: [],
} as const;

// ---------------------------------------------------------------------------
// Pure State Machine Functions
// ---------------------------------------------------------------------------

/**
 * Returns true if the transition from currentStatus to targetStatus is permitted.
 */
export function canTransitionVariationOrderStatus(
  currentStatus: VariationOrderStatus,
  targetStatus: VariationOrderStatus,
): boolean {
  const allowed = ALLOWED_VARIATION_ORDER_TRANSITIONS[currentStatus];
  return allowed.includes(targetStatus);
}

/**
 * Asserts that a transition from currentStatus to targetStatus is permitted.
 * Throws AppError('INVALID_STATE_TRANSITION') if the transition is invalid.
 */
export function assertCanTransitionVariationOrderStatus(
  currentStatus: VariationOrderStatus,
  targetStatus: VariationOrderStatus,
): void {
  if (!canTransitionVariationOrderStatus(currentStatus, targetStatus)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن تغيير حالة أمر التغيير من "${currentStatus}" إلى "${targetStatus}"`,
    );
  }
}

/**
 * Returns true if the variation order is currently editable.
 * Only DRAFT status is editable.
 */
export function isVariationOrderEditable(status: VariationOrderStatus): boolean {
  return status === VariationOrderStatus.DRAFT;
}

/**
 * Returns true if the variation order has been formally approved.
 */
export function isVariationOrderApproved(status: VariationOrderStatus): boolean {
  return status === VariationOrderStatus.APPROVED;
}

/**
 * Returns true if the status is terminal (cannot transition to any other status).
 * APPROVED is terminal.
 */
export function isVariationOrderTerminal(status: VariationOrderStatus): boolean {
  return ALLOWED_VARIATION_ORDER_TRANSITIONS[status].length === 0;
}
