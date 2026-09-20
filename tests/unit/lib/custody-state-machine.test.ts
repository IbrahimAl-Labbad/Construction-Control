/**
 * tests/unit/lib/custody-state-machine.test.ts
 *
 * Unit tests for Custody State Machine:
 * - 9 states verification
 * - All valid transitions:
 *     DRAFT -> SUBMITTED
 *     SUBMITTED -> APPROVED, REJECTED
 *     REJECTED -> DRAFT (reopen)
 *     APPROVED -> ISSUED, CANCELLED
 *     ISSUED -> PARTIALLY_SETTLED, SETTLED
 *     PARTIALLY_SETTLED -> PARTIALLY_SETTLED, SETTLED
 *     SETTLED -> CLOSED
 * - Terminal states: CANCELLED, CLOSED
 * - Forbidden transitions (e.g., ISSUED -> CANCELLED, CLOSED -> anything, DRAFT -> APPROVED)
 */

import { describe, expect, it } from 'vitest';
import { CustodyStatus } from '@prisma/client';
import {
  VALID_CUSTODY_TRANSITIONS,
  canTransitionCustodyStatus,
  assertCanTransitionCustodyStatus,
} from '@/lib/custodies/state-machine';
import { AppError } from '@/lib/errors';

describe('Custody State Machine', () => {
  it('defines valid transitions for all 9 states', () => {
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.DRAFT]).toEqual([CustodyStatus.SUBMITTED]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.SUBMITTED]).toEqual([
      CustodyStatus.APPROVED,
      CustodyStatus.REJECTED,
    ]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.REJECTED]).toEqual([CustodyStatus.DRAFT]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.APPROVED]).toEqual([
      CustodyStatus.ISSUED,
      CustodyStatus.CANCELLED,
    ]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.ISSUED]).toEqual([
      CustodyStatus.PARTIALLY_SETTLED,
      CustodyStatus.SETTLED,
    ]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.PARTIALLY_SETTLED]).toEqual([
      CustodyStatus.PARTIALLY_SETTLED,
      CustodyStatus.SETTLED,
    ]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.SETTLED]).toEqual([CustodyStatus.CLOSED]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.CANCELLED]).toEqual([]);
    expect(VALID_CUSTODY_TRANSITIONS[CustodyStatus.CLOSED]).toEqual([]);
  });

  describe('Allowed transitions', () => {
    const validPairs: Array<[CustodyStatus, CustodyStatus]> = [
      [CustodyStatus.DRAFT, CustodyStatus.SUBMITTED],
      [CustodyStatus.SUBMITTED, CustodyStatus.APPROVED],
      [CustodyStatus.SUBMITTED, CustodyStatus.REJECTED],
      [CustodyStatus.REJECTED, CustodyStatus.DRAFT],
      [CustodyStatus.APPROVED, CustodyStatus.ISSUED],
      [CustodyStatus.APPROVED, CustodyStatus.CANCELLED],
      [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED],
      [CustodyStatus.ISSUED, CustodyStatus.SETTLED],
      [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.PARTIALLY_SETTLED],
      [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.SETTLED],
      [CustodyStatus.SETTLED, CustodyStatus.CLOSED],
    ];

    for (const [from, to] of validPairs) {
      it(`allows transition from ${from} to ${to}`, () => {
        expect(canTransitionCustodyStatus(from, to)).toBe(true);
        expect(() => assertCanTransitionCustodyStatus(from, to)).not.toThrow();
      });
    }
  });

  describe('Terminal states are strictly immutable', () => {
    const allStatuses = Object.values(CustodyStatus);

    for (const status of allStatuses) {
      it(`forbids CANCELLED -> ${status}`, () => {
        expect(canTransitionCustodyStatus(CustodyStatus.CANCELLED, status)).toBe(false);
        expect(() => assertCanTransitionCustodyStatus(CustodyStatus.CANCELLED, status)).toThrow(AppError);
      });

      it(`forbids CLOSED -> ${status}`, () => {
        expect(canTransitionCustodyStatus(CustodyStatus.CLOSED, status)).toBe(false);
        expect(() => assertCanTransitionCustodyStatus(CustodyStatus.CLOSED, status)).toThrow(AppError);
      });
    }
  });

  describe('Forbidden transitions', () => {
    const invalidPairs: Array<[CustodyStatus, CustodyStatus]> = [
      [CustodyStatus.DRAFT, CustodyStatus.APPROVED],
      [CustodyStatus.DRAFT, CustodyStatus.ISSUED],
      [CustodyStatus.DRAFT, CustodyStatus.CANCELLED],
      [CustodyStatus.SUBMITTED, CustodyStatus.ISSUED],
      [CustodyStatus.SUBMITTED, CustodyStatus.CANCELLED],
      [CustodyStatus.REJECTED, CustodyStatus.APPROVED],
      [CustodyStatus.REJECTED, CustodyStatus.ISSUED],
      // Crucial invariant: Once ISSUED, cannot be CANCELLED (must be settled or closed)
      [CustodyStatus.ISSUED, CustodyStatus.CANCELLED],
      [CustodyStatus.ISSUED, CustodyStatus.DRAFT],
      [CustodyStatus.ISSUED, CustodyStatus.CLOSED],
      [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.CANCELLED],
      [CustodyStatus.PARTIALLY_SETTLED, CustodyStatus.CLOSED],
      [CustodyStatus.SETTLED, CustodyStatus.CANCELLED],
      [CustodyStatus.SETTLED, CustodyStatus.DRAFT],
      [CustodyStatus.SETTLED, CustodyStatus.ISSUED],
    ];

    for (const [from, to] of invalidPairs) {
      it(`forbids transition from ${from} to ${to}`, () => {
        expect(canTransitionCustodyStatus(from, to)).toBe(false);
        expect(() => assertCanTransitionCustodyStatus(from, to)).toThrow(AppError);
        try {
          assertCanTransitionCustodyStatus(from, to);
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });
});
