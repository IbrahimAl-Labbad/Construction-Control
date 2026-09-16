/**
 * tests/unit/lib/budget-state-machine.test.ts
 *
 * Unit tests for Project Budget State Machine (Version 1).
 *
 * Verifies:
 * - canTransitionBudgetStatus
 * - assertCanTransitionBudgetStatus
 * - getAllowedNextBudgetStatuses
 * - Strict transition matrix enforcement
 * - Immutability of terminal states (APPROVED, SUPERSEDED)
 */

import { describe, expect, it } from 'vitest';
import { BudgetStatus } from '@prisma/client';

import {
  canTransitionBudgetStatus,
  assertCanTransitionBudgetStatus,
  getAllowedNextBudgetStatuses,
} from '@/lib/budget/state-machine';
import { AppError } from '@/lib/errors';

const { DRAFT, SUBMITTED, APPROVED, REJECTED, SUPERSEDED } = BudgetStatus;

describe('Budget State Machine', () => {
  describe('canTransitionBudgetStatus', () => {
    // Valid transitions
    it('allows DRAFT → SUBMITTED', () => {
      expect(canTransitionBudgetStatus(DRAFT, SUBMITTED)).toBe(true);
    });

    it('allows SUBMITTED → APPROVED', () => {
      expect(canTransitionBudgetStatus(SUBMITTED, APPROVED)).toBe(true);
    });

    it('allows SUBMITTED → REJECTED', () => {
      expect(canTransitionBudgetStatus(SUBMITTED, REJECTED)).toBe(true);
    });

    it('allows REJECTED → DRAFT', () => {
      expect(canTransitionBudgetStatus(REJECTED, DRAFT)).toBe(true);
    });

    // Disallowed transitions from DRAFT
    it('disallows DRAFT → APPROVED (skipping review)', () => {
      expect(canTransitionBudgetStatus(DRAFT, APPROVED)).toBe(false);
    });

    it('disallows DRAFT → REJECTED', () => {
      expect(canTransitionBudgetStatus(DRAFT, REJECTED)).toBe(false);
    });

    it('disallows DRAFT → SUPERSEDED', () => {
      expect(canTransitionBudgetStatus(DRAFT, SUPERSEDED)).toBe(false);
    });

    // Disallowed transitions from SUBMITTED
    it('disallows SUBMITTED → DRAFT (must be rejected first)', () => {
      expect(canTransitionBudgetStatus(SUBMITTED, DRAFT)).toBe(false);
    });

    it('disallows SUBMITTED → SUPERSEDED', () => {
      expect(canTransitionBudgetStatus(SUBMITTED, SUPERSEDED)).toBe(false);
    });

    // Disallowed transitions from REJECTED
    it('disallows REJECTED → APPROVED (must reopen as DRAFT and resubmit)', () => {
      expect(canTransitionBudgetStatus(REJECTED, APPROVED)).toBe(false);
    });

    it('disallows REJECTED → SUBMITTED', () => {
      expect(canTransitionBudgetStatus(REJECTED, SUBMITTED)).toBe(false);
    });

    // APPROVED is strictly terminal in Version 1
    it('disallows transitions from APPROVED to any state', () => {
      expect(canTransitionBudgetStatus(APPROVED, DRAFT)).toBe(false);
      expect(canTransitionBudgetStatus(APPROVED, SUBMITTED)).toBe(false);
      expect(canTransitionBudgetStatus(APPROVED, REJECTED)).toBe(false);
      expect(canTransitionBudgetStatus(APPROVED, SUPERSEDED)).toBe(false);
    });

    // SUPERSEDED is terminal
    it('disallows transitions from SUPERSEDED to any state', () => {
      expect(canTransitionBudgetStatus(SUPERSEDED, DRAFT)).toBe(false);
      expect(canTransitionBudgetStatus(SUPERSEDED, SUBMITTED)).toBe(false);
      expect(canTransitionBudgetStatus(SUPERSEDED, APPROVED)).toBe(false);
      expect(canTransitionBudgetStatus(SUPERSEDED, REJECTED)).toBe(false);
    });

    // Self-transitions are disallowed
    it('disallows self-transitions', () => {
      expect(canTransitionBudgetStatus(DRAFT, DRAFT)).toBe(false);
      expect(canTransitionBudgetStatus(SUBMITTED, SUBMITTED)).toBe(false);
      expect(canTransitionBudgetStatus(APPROVED, APPROVED)).toBe(false);
      expect(canTransitionBudgetStatus(REJECTED, REJECTED)).toBe(false);
    });
  });

  describe('assertCanTransitionBudgetStatus', () => {
    it('does not throw for valid transition', () => {
      expect(() => assertCanTransitionBudgetStatus(DRAFT, SUBMITTED)).not.toThrow();
      expect(() => assertCanTransitionBudgetStatus(SUBMITTED, APPROVED)).not.toThrow();
      expect(() => assertCanTransitionBudgetStatus(SUBMITTED, REJECTED)).not.toThrow();
      expect(() => assertCanTransitionBudgetStatus(REJECTED, DRAFT)).not.toThrow();
    });

    it('throws AppError with INVALID_STATE_TRANSITION for invalid transition', () => {
      expect(() => assertCanTransitionBudgetStatus(DRAFT, APPROVED)).toThrow(AppError);
      try {
        assertCanTransitionBudgetStatus(DRAFT, APPROVED);
      } catch (err) {
        expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
      }
    });

    it('throws for transition from terminal APPROVED state', () => {
      expect(() => assertCanTransitionBudgetStatus(APPROVED, DRAFT)).toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });
  });

  describe('getAllowedNextBudgetStatuses', () => {
    it('returns [SUBMITTED] for DRAFT', () => {
      expect(getAllowedNextBudgetStatuses(DRAFT)).toEqual([SUBMITTED]);
    });

    it('returns [APPROVED, REJECTED] for SUBMITTED', () => {
      expect(getAllowedNextBudgetStatuses(SUBMITTED)).toEqual([APPROVED, REJECTED]);
    });

    it('returns [DRAFT] for REJECTED', () => {
      expect(getAllowedNextBudgetStatuses(REJECTED)).toEqual([DRAFT]);
    });

    it('returns [] for APPROVED (terminal)', () => {
      expect(getAllowedNextBudgetStatuses(APPROVED)).toEqual([]);
    });

    it('returns [] for SUPERSEDED (terminal)', () => {
      expect(getAllowedNextBudgetStatuses(SUPERSEDED)).toEqual([]);
    });
  });
});
