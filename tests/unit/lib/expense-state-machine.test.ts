/**
 * tests/unit/lib/expense-state-machine.test.ts
 *
 * Unit tests for Expense lifecycle state machine transitions.
 * Proves allowed transitions, forbidden transitions, and terminal APPROVED state.
 */

import { describe, it, expect } from 'vitest';
import { ExpenseStatus } from '@prisma/client';
import {
  canTransitionExpenseStatus,
  assertCanTransitionExpenseStatus,
  getAllowedNextExpenseStatuses,
} from '@/lib/expenses';
import { AppError } from '@/lib/errors';

describe('Expense State Machine', () => {
  const { DRAFT, SUBMITTED, APPROVED, REJECTED } = ExpenseStatus;

  describe('canTransitionExpenseStatus', () => {
    it('allows legal transitions', () => {
      expect(canTransitionExpenseStatus(DRAFT, SUBMITTED)).toBe(true);
      expect(canTransitionExpenseStatus(SUBMITTED, APPROVED)).toBe(true);
      expect(canTransitionExpenseStatus(SUBMITTED, REJECTED)).toBe(true);
      expect(canTransitionExpenseStatus(REJECTED, DRAFT)).toBe(true);
    });

    it('forbids illegal forward jumps', () => {
      expect(canTransitionExpenseStatus(DRAFT, APPROVED)).toBe(false);
      expect(canTransitionExpenseStatus(DRAFT, REJECTED)).toBe(false);
      expect(canTransitionExpenseStatus(REJECTED, APPROVED)).toBe(false);
      expect(canTransitionExpenseStatus(REJECTED, SUBMITTED)).toBe(false);
    });

    it('forbids transitions out of terminal APPROVED state', () => {
      expect(canTransitionExpenseStatus(APPROVED, DRAFT)).toBe(false);
      expect(canTransitionExpenseStatus(APPROVED, SUBMITTED)).toBe(false);
      expect(canTransitionExpenseStatus(APPROVED, REJECTED)).toBe(false);
    });

    it('forbids self-transitions', () => {
      expect(canTransitionExpenseStatus(DRAFT, DRAFT)).toBe(false);
      expect(canTransitionExpenseStatus(SUBMITTED, SUBMITTED)).toBe(false);
      expect(canTransitionExpenseStatus(APPROVED, APPROVED)).toBe(false);
      expect(canTransitionExpenseStatus(REJECTED, REJECTED)).toBe(false);
    });
  });

  describe('assertCanTransitionExpenseStatus', () => {
    it('does not throw for allowed transitions', () => {
      expect(() => assertCanTransitionExpenseStatus(DRAFT, SUBMITTED)).not.toThrow();
      expect(() => assertCanTransitionExpenseStatus(SUBMITTED, APPROVED)).not.toThrow();
      expect(() => assertCanTransitionExpenseStatus(SUBMITTED, REJECTED)).not.toThrow();
      expect(() => assertCanTransitionExpenseStatus(REJECTED, DRAFT)).not.toThrow();
    });

    it('throws INVALID_STATE_TRANSITION with descriptive message on illegal transition', () => {
      expect(() => assertCanTransitionExpenseStatus(DRAFT, APPROVED)).toThrow(
        expect.objectContaining({
          code: 'INVALID_STATE_TRANSITION',
        }),
      );

      expect(() => assertCanTransitionExpenseStatus(APPROVED, DRAFT)).toThrow(AppError);
    });
  });

  describe('getAllowedNextExpenseStatuses', () => {
    it('returns exactly [SUBMITTED] for DRAFT', () => {
      expect(getAllowedNextExpenseStatuses(DRAFT)).toEqual([SUBMITTED]);
    });

    it('returns [APPROVED, REJECTED] for SUBMITTED', () => {
      expect(getAllowedNextExpenseStatuses(SUBMITTED)).toEqual([APPROVED, REJECTED]);
    });

    it('returns [DRAFT] for REJECTED', () => {
      expect(getAllowedNextExpenseStatuses(REJECTED)).toEqual([DRAFT]);
    });

    it('returns empty array for APPROVED (terminal)', () => {
      expect(getAllowedNextExpenseStatuses(APPROVED)).toEqual([]);
    });
  });
});
