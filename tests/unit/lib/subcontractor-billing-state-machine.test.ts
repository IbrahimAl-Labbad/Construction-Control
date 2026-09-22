/**
 * tests/unit/lib/subcontractor-billing-state-machine.test.ts
 *
 * Unit tests for Subcontractor Billing State Machine:
 * - 5 states verification (DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED)
 * - All valid transitions:
 *     DRAFT -> SUBMITTED
 *     DRAFT -> CANCELLED
 *     SUBMITTED -> APPROVED
 *     SUBMITTED -> REJECTED
 *     SUBMITTED -> CANCELLED
 *     REJECTED -> DRAFT (reopen)
 * - Terminal states: APPROVED (immutable ledger invariant), CANCELLED
 * - Exhaustive forbidden transitions (e.g. APPROVED -> anything, CANCELLED -> anything, DRAFT -> APPROVED)
 * - Matrix verification via getAllowedNextBillingStatuses, canTransitionBillingStatus, assertCanTransitionBillingStatus
 */

import { describe, expect, it } from 'vitest';
import { SubcontractorBillingStatus } from '@prisma/client';
import {
  ALLOWED_BILLING_TRANSITIONS,
  canTransitionBillingStatus,
  assertCanTransitionBillingStatus,
  getAllowedNextBillingStatuses,
} from '@/lib/subcontractor-billings/state-machine';
import { AppError } from '@/lib/errors';

describe('Subcontractor Billing State Machine', () => {
  describe('getAllowedNextBillingStatuses', () => {
    it('returns [SUBMITTED, CANCELLED] for DRAFT', () => {
      expect(getAllowedNextBillingStatuses(SubcontractorBillingStatus.DRAFT)).toEqual([
        SubcontractorBillingStatus.SUBMITTED,
        SubcontractorBillingStatus.CANCELLED,
      ]);
    });

    it('returns [APPROVED, REJECTED, CANCELLED] for SUBMITTED', () => {
      expect(getAllowedNextBillingStatuses(SubcontractorBillingStatus.SUBMITTED)).toEqual([
        SubcontractorBillingStatus.APPROVED,
        SubcontractorBillingStatus.REJECTED,
        SubcontractorBillingStatus.CANCELLED,
      ]);
    });

    it('returns [DRAFT] for REJECTED (reopen for correction)', () => {
      expect(getAllowedNextBillingStatuses(SubcontractorBillingStatus.REJECTED)).toEqual([
        SubcontractorBillingStatus.DRAFT,
      ]);
    });

    it('returns [] for APPROVED (terminal state — strictly immutable ledger record)', () => {
      expect(getAllowedNextBillingStatuses(SubcontractorBillingStatus.APPROVED)).toEqual([]);
    });

    it('returns [] for CANCELLED (terminal state)', () => {
      expect(getAllowedNextBillingStatuses(SubcontractorBillingStatus.CANCELLED)).toEqual([]);
    });
  });

  describe('Allowed transitions', () => {
    const validTransitions: Array<[SubcontractorBillingStatus, SubcontractorBillingStatus]> = [
      [SubcontractorBillingStatus.DRAFT, SubcontractorBillingStatus.SUBMITTED],
      [SubcontractorBillingStatus.DRAFT, SubcontractorBillingStatus.CANCELLED],
      [SubcontractorBillingStatus.SUBMITTED, SubcontractorBillingStatus.APPROVED],
      [SubcontractorBillingStatus.SUBMITTED, SubcontractorBillingStatus.REJECTED],
      [SubcontractorBillingStatus.SUBMITTED, SubcontractorBillingStatus.CANCELLED],
      [SubcontractorBillingStatus.REJECTED, SubcontractorBillingStatus.DRAFT],
    ];

    for (const [from, to] of validTransitions) {
      it(`allows transition from ${from} to ${to}`, () => {
        expect(canTransitionBillingStatus(from, to)).toBe(true);
        expect(() => assertCanTransitionBillingStatus(from, to)).not.toThrow();
      });
    }
  });

  describe('Terminal states are strictly immutable', () => {
    const allStatuses = Object.values(SubcontractorBillingStatus);

    describe('APPROVED is terminal (AGENTS.md §13 append-only ledger invariant)', () => {
      for (const target of allStatuses) {
        it(`forbids APPROVED -> ${target}`, () => {
          expect(canTransitionBillingStatus(SubcontractorBillingStatus.APPROVED, target)).toBe(false);
          expect(() =>
            assertCanTransitionBillingStatus(SubcontractorBillingStatus.APPROVED, target),
          ).toThrow(AppError);

          try {
            assertCanTransitionBillingStatus(SubcontractorBillingStatus.APPROVED, target);
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe('INVALID_STATE_TRANSITION');
          }
        });
      }
    });

    describe('CANCELLED is terminal', () => {
      for (const target of allStatuses) {
        it(`forbids CANCELLED -> ${target}`, () => {
          expect(canTransitionBillingStatus(SubcontractorBillingStatus.CANCELLED, target)).toBe(false);
          expect(() =>
            assertCanTransitionBillingStatus(SubcontractorBillingStatus.CANCELLED, target),
          ).toThrow(AppError);

          try {
            assertCanTransitionBillingStatus(SubcontractorBillingStatus.CANCELLED, target);
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe('INVALID_STATE_TRANSITION');
          }
        });
      }
    });
  });

  describe('Exhaustive invalid transitions', () => {
    const invalidTransitions: Array<[SubcontractorBillingStatus, SubcontractorBillingStatus]> = [
      // DRAFT invalid targets
      [SubcontractorBillingStatus.DRAFT, SubcontractorBillingStatus.DRAFT],
      [SubcontractorBillingStatus.DRAFT, SubcontractorBillingStatus.APPROVED], // Cannot directly approve draft
      [SubcontractorBillingStatus.DRAFT, SubcontractorBillingStatus.REJECTED], // Cannot reject unsubmitted draft

      // SUBMITTED invalid targets
      [SubcontractorBillingStatus.SUBMITTED, SubcontractorBillingStatus.SUBMITTED],
      [SubcontractorBillingStatus.SUBMITTED, SubcontractorBillingStatus.DRAFT], // Cannot directly revert without reject

      // REJECTED invalid targets
      [SubcontractorBillingStatus.REJECTED, SubcontractorBillingStatus.REJECTED],
      [SubcontractorBillingStatus.REJECTED, SubcontractorBillingStatus.SUBMITTED], // Must reopen to DRAFT first
      [SubcontractorBillingStatus.REJECTED, SubcontractorBillingStatus.APPROVED], // Cannot approve rejected directly
      [SubcontractorBillingStatus.REJECTED, SubcontractorBillingStatus.CANCELLED], // Cannot cancel rejected directly
    ];

    for (const [from, to] of invalidTransitions) {
      it(`forbids invalid transition from ${from} to ${to}`, () => {
        expect(canTransitionBillingStatus(from, to)).toBe(false);
        expect(() => assertCanTransitionBillingStatus(from, to)).toThrow(AppError);

        try {
          assertCanTransitionBillingStatus(from, to);
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).code).toBe('INVALID_STATE_TRANSITION');
          expect((error as AppError).message).toContain(from);
          expect((error as AppError).message).toContain(to);
        }
      });
    }

    it('matches exact ALLOWED_BILLING_TRANSITIONS matrix for all 25 state pairs', () => {
      const allStatuses = Object.values(SubcontractorBillingStatus);
      let allowedCount = 0;
      let forbiddenCount = 0;

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const isAllowed = ALLOWED_BILLING_TRANSITIONS[from].includes(to);
          expect(canTransitionBillingStatus(from, to)).toBe(isAllowed);
          if (isAllowed) {
            allowedCount++;
          } else {
            forbiddenCount++;
          }
        }
      }

      // Exactly 6 valid transitions and 19 forbidden transitions out of 25 pairs
      expect(allowedCount).toBe(6);
      expect(forbiddenCount).toBe(19);
    });
  });
});
