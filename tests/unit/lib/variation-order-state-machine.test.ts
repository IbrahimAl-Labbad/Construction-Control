/**
 * tests/unit/lib/variation-order-state-machine.test.ts
 *
 * Unit tests for the Variation Order lifecycle state machine (Slice 20).
 * Tests valid transitions, invalid transitions, terminal immutability,
 * and transition guard assertions.
 *
 * Follows AGENTS.md §9, §10, §20.
 */

import { describe, expect, it } from 'vitest';
import { VariationOrderStatus } from '@prisma/client';
import {
  ALLOWED_VARIATION_ORDER_TRANSITIONS,
  canTransitionVariationOrderStatus,
  assertCanTransitionVariationOrderStatus,
  isVariationOrderEditable,
  isVariationOrderApproved,
  isVariationOrderTerminal,
} from '@/lib/variation-orders/state-machine';
import { AppError } from '@/lib/errors';

describe('Variation Order State Machine', () => {
  describe('Allowed Transitions Matrix', () => {
    it('defines exactly the permitted forward and backward transitions', () => {
      expect(ALLOWED_VARIATION_ORDER_TRANSITIONS).toEqual({
        [VariationOrderStatus.DRAFT]: [VariationOrderStatus.SUBMITTED],
        [VariationOrderStatus.SUBMITTED]: [
          VariationOrderStatus.APPROVED,
          VariationOrderStatus.REJECTED,
        ],
        [VariationOrderStatus.APPROVED]: [],
        [VariationOrderStatus.REJECTED]: [VariationOrderStatus.DRAFT],
      });
    });
  });

  describe('canTransitionVariationOrderStatus', () => {
    it('allows DRAFT -> SUBMITTED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.DRAFT,
          VariationOrderStatus.SUBMITTED,
        ),
      ).toBe(true);
    });

    it('allows SUBMITTED -> APPROVED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.SUBMITTED,
          VariationOrderStatus.APPROVED,
        ),
      ).toBe(true);
    });

    it('allows SUBMITTED -> REJECTED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.SUBMITTED,
          VariationOrderStatus.REJECTED,
        ),
      ).toBe(true);
    });

    it('allows REJECTED -> DRAFT (reopening for edit)', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.REJECTED,
          VariationOrderStatus.DRAFT,
        ),
      ).toBe(true);
    });

    it('disallows skipping steps: DRAFT -> APPROVED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.DRAFT,
          VariationOrderStatus.APPROVED,
        ),
      ).toBe(false);
    });

    it('disallows skipping steps: DRAFT -> REJECTED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.DRAFT,
          VariationOrderStatus.REJECTED,
        ),
      ).toBe(false);
    });

    it('disallows transitioning out of APPROVED (terminal state immutability)', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.APPROVED,
          VariationOrderStatus.DRAFT,
        ),
      ).toBe(false);
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.APPROVED,
          VariationOrderStatus.SUBMITTED,
        ),
      ).toBe(false);
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.APPROVED,
          VariationOrderStatus.REJECTED,
        ),
      ).toBe(false);
    });

    it('disallows direct re-approval from REJECTED: REJECTED -> APPROVED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.REJECTED,
          VariationOrderStatus.APPROVED,
        ),
      ).toBe(false);
    });

    it('disallows direct resubmission from REJECTED without reopening: REJECTED -> SUBMITTED', () => {
      expect(
        canTransitionVariationOrderStatus(
          VariationOrderStatus.REJECTED,
          VariationOrderStatus.SUBMITTED,
        ),
      ).toBe(false);
    });

    it('disallows self-transitions', () => {
      for (const status of Object.values(VariationOrderStatus)) {
        expect(canTransitionVariationOrderStatus(status, status)).toBe(false);
      }
    });
  });

  describe('assertCanTransitionVariationOrderStatus', () => {
    it('does not throw on valid transition', () => {
      expect(() =>
        assertCanTransitionVariationOrderStatus(
          VariationOrderStatus.DRAFT,
          VariationOrderStatus.SUBMITTED,
        ),
      ).not.toThrow();
    });

    it('throws AppError with code INVALID_STATE_TRANSITION on invalid transition', () => {
      try {
        assertCanTransitionVariationOrderStatus(
          VariationOrderStatus.DRAFT,
          VariationOrderStatus.APPROVED,
        );
        expect.fail('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appError = err as AppError;
        expect(appError.code).toBe('INVALID_STATE_TRANSITION');
        expect(appError.message).toContain('DRAFT');
        expect(appError.message).toContain('APPROVED');
      }
    });

    it('throws AppError on attempt to mutate APPROVED state', () => {
      expect(() =>
        assertCanTransitionVariationOrderStatus(
          VariationOrderStatus.APPROVED,
          VariationOrderStatus.DRAFT,
        ),
      ).toThrowError(/APPROVED.*DRAFT/);
    });
  });

  describe('Helper Predicates', () => {
    it('isVariationOrderEditable is true only for DRAFT', () => {
      expect(isVariationOrderEditable(VariationOrderStatus.DRAFT)).toBe(true);
      expect(isVariationOrderEditable(VariationOrderStatus.SUBMITTED)).toBe(false);
      expect(isVariationOrderEditable(VariationOrderStatus.APPROVED)).toBe(false);
      expect(isVariationOrderEditable(VariationOrderStatus.REJECTED)).toBe(false);
    });

    it('isVariationOrderApproved is true only for APPROVED', () => {
      expect(isVariationOrderApproved(VariationOrderStatus.APPROVED)).toBe(true);
      expect(isVariationOrderApproved(VariationOrderStatus.DRAFT)).toBe(false);
      expect(isVariationOrderApproved(VariationOrderStatus.SUBMITTED)).toBe(false);
      expect(isVariationOrderApproved(VariationOrderStatus.REJECTED)).toBe(false);
    });

    it('isVariationOrderTerminal is true only for APPROVED', () => {
      expect(isVariationOrderTerminal(VariationOrderStatus.APPROVED)).toBe(true);
      expect(isVariationOrderTerminal(VariationOrderStatus.DRAFT)).toBe(false);
      expect(isVariationOrderTerminal(VariationOrderStatus.SUBMITTED)).toBe(false);
      expect(isVariationOrderTerminal(VariationOrderStatus.REJECTED)).toBe(false);
    });
  });
});
