/**
 * lib/custodies/state-machine.ts
 *
 * Strict state machine for the Custody / Advance Payments & Settlement module.
 *
 * Enforces the 9-state lifecycle:
 * DRAFT -> SUBMITTED -> APPROVED / REJECTED
 * REJECTED -> DRAFT (reopen)
 * APPROVED -> ISSUED / CANCELLED (pre-issuance only)
 * ISSUED -> PARTIALLY_SETTLED / SETTLED
 * PARTIALLY_SETTLED -> PARTIALLY_SETTLED / SETTLED
 * SETTLED -> CLOSED
 *
 * CANCELLED and CLOSED are strictly terminal.
 */

import { CustodyStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

export const VALID_CUSTODY_TRANSITIONS: Record<CustodyStatus, CustodyStatus[]> = {
  [CustodyStatus.DRAFT]: [CustodyStatus.SUBMITTED],
  [CustodyStatus.SUBMITTED]: [CustodyStatus.APPROVED, CustodyStatus.REJECTED],
  [CustodyStatus.REJECTED]: [CustodyStatus.DRAFT],
  [CustodyStatus.APPROVED]: [CustodyStatus.ISSUED, CustodyStatus.CANCELLED],
  [CustodyStatus.CANCELLED]: [], // Terminal
  [CustodyStatus.ISSUED]: [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.SETTLED],
  [CustodyStatus.PARTIALLY_SETTLED]: [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.SETTLED],
  [CustodyStatus.SETTLED]: [CustodyStatus.CLOSED],
  [CustodyStatus.CLOSED]: [], // Terminal
};

/**
 * Checks whether a transition between two custody states is permitted.
 */
export function canTransitionCustodyStatus(
  current: CustodyStatus,
  target: CustodyStatus,
): boolean {
  const allowed = VALID_CUSTODY_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

/**
 * Asserts that a custody status transition is valid, throwing an AppError if illegal.
 */
export function assertCanTransitionCustodyStatus(
  current: CustodyStatus,
  target: CustodyStatus,
): void {
  if (!canTransitionCustodyStatus(current, target)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `لا يمكن نقل حالة العهدة من "${current}" إلى "${target}"`,
    );
  }
}
