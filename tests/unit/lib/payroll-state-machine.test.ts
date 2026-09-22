/**
 * tests/unit/lib/payroll-state-machine.test.ts
 *
 * Unit tests for Payroll State Machine and Domain Status Assertions.
 * Tests:
 * - 5 states verification (DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED)
 * - All valid transitions:
 *     DRAFT → SUBMITTED
 *     DRAFT → CANCELLED
 *     SUBMITTED → APPROVED
 *     SUBMITTED → REJECTED
 *     SUBMITTED → CANCELLED
 *     REJECTED → DRAFT (reopen)
 * - Terminal states: APPROVED (immutable ledger record, AGENTS.md §13), CANCELLED
 * - Exhaustive forbidden transitions
 * - Helper assertions:
 *     isEditablePayrollStatus
 *     isTerminalPayrollStatus
 *     assertValidPayrollTransition
 *     assertPayrollIsEditable
 *     assertPayrollCanBeApproved
 *     assertPayrollCanBeRejected
 *     assertPayrollCanBeCancelled
 */

import { describe, expect, it } from 'vitest';
import { PayrollStatus } from '@prisma/client';
import {
  ALLOWED_PAYROLL_TRANSITIONS,
  canTransitionPayrollStatus,
  assertValidPayrollTransition,
  getAllowedNextPayrollStatuses,
  isEditablePayrollStatus,
  isTerminalPayrollStatus,
  assertPayrollIsEditable,
  assertPayrollCanBeApproved,
  assertPayrollCanBeRejected,
  assertPayrollCanBeCancelled,
} from '@/lib/payroll/state-machine';
import { AppError } from '@/lib/errors';

describe('Payroll State Machine', () => {
  const allStatuses = Object.values(PayrollStatus);

  describe('ALLOWED_PAYROLL_TRANSITIONS matrix', () => {
    it('defines transitions for all 5 statuses', () => {
      expect(Object.keys(ALLOWED_PAYROLL_TRANSITIONS)).toHaveLength(5);
      for (const status of allStatuses) {
        expect(ALLOWED_PAYROLL_TRANSITIONS[status]).toBeDefined();
      }
    });
  });

  describe('getAllowedNextPayrollStatuses', () => {
    it('returns [SUBMITTED, CANCELLED] for DRAFT', () => {
      expect(getAllowedNextPayrollStatuses(PayrollStatus.DRAFT)).toEqual([
        PayrollStatus.SUBMITTED,
        PayrollStatus.CANCELLED,
      ]);
    });

    it('returns [APPROVED, REJECTED, CANCELLED] for SUBMITTED', () => {
      expect(getAllowedNextPayrollStatuses(PayrollStatus.SUBMITTED)).toEqual([
        PayrollStatus.APPROVED,
        PayrollStatus.REJECTED,
        PayrollStatus.CANCELLED,
      ]);
    });

    it('returns [DRAFT] for REJECTED (reopen for correction)', () => {
      expect(getAllowedNextPayrollStatuses(PayrollStatus.REJECTED)).toEqual([
        PayrollStatus.DRAFT,
      ]);
    });

    it('returns [] for APPROVED (terminal state — strictly immutable ledger record)', () => {
      expect(getAllowedNextPayrollStatuses(PayrollStatus.APPROVED)).toEqual([]);
    });

    it('returns [] for CANCELLED (terminal state)', () => {
      expect(getAllowedNextPayrollStatuses(PayrollStatus.CANCELLED)).toEqual([]);
    });
  });

  describe('Allowed transitions (6 valid transitions)', () => {
    const validTransitions: Array<[PayrollStatus, PayrollStatus]> = [
      [PayrollStatus.DRAFT, PayrollStatus.SUBMITTED],
      [PayrollStatus.DRAFT, PayrollStatus.CANCELLED],
      [PayrollStatus.SUBMITTED, PayrollStatus.APPROVED],
      [PayrollStatus.SUBMITTED, PayrollStatus.REJECTED],
      [PayrollStatus.SUBMITTED, PayrollStatus.CANCELLED],
      [PayrollStatus.REJECTED, PayrollStatus.DRAFT],
    ];

    for (const [from, to] of validTransitions) {
      it(`allows transition from ${from} to ${to}`, () => {
        expect(canTransitionPayrollStatus(from, to)).toBe(true);
        expect(() => assertValidPayrollTransition(from, to)).not.toThrow();
      });
    }
  });

  describe('Forbidden transitions from DRAFT', () => {
    const forbiddenFromDraft = [
      PayrollStatus.APPROVED,
      PayrollStatus.REJECTED,
      PayrollStatus.DRAFT,
    ];

    for (const target of forbiddenFromDraft) {
      it(`forbids DRAFT -> ${target}`, () => {
        expect(canTransitionPayrollStatus(PayrollStatus.DRAFT, target)).toBe(false);
        expect(() => assertValidPayrollTransition(PayrollStatus.DRAFT, target)).toThrow(AppError);
        try {
          assertValidPayrollTransition(PayrollStatus.DRAFT, target);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('Forbidden transitions from SUBMITTED', () => {
    const forbiddenFromSubmitted = [
      PayrollStatus.DRAFT,
      PayrollStatus.SUBMITTED,
    ];

    for (const target of forbiddenFromSubmitted) {
      it(`forbids SUBMITTED -> ${target}`, () => {
        expect(canTransitionPayrollStatus(PayrollStatus.SUBMITTED, target)).toBe(false);
        expect(() => assertValidPayrollTransition(PayrollStatus.SUBMITTED, target)).toThrow(AppError);
        try {
          assertValidPayrollTransition(PayrollStatus.SUBMITTED, target);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('Forbidden transitions from REJECTED', () => {
    const forbiddenFromRejected = [
      PayrollStatus.APPROVED,
      PayrollStatus.CANCELLED,
      PayrollStatus.SUBMITTED,
      PayrollStatus.REJECTED,
    ];

    for (const target of forbiddenFromRejected) {
      it(`forbids REJECTED -> ${target}`, () => {
        expect(canTransitionPayrollStatus(PayrollStatus.REJECTED, target)).toBe(false);
        expect(() => assertValidPayrollTransition(PayrollStatus.REJECTED, target)).toThrow(AppError);
        try {
          assertValidPayrollTransition(PayrollStatus.REJECTED, target);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('Terminal states: APPROVED is strictly immutable', () => {
    for (const target of allStatuses) {
      it(`forbids APPROVED -> ${target}`, () => {
        expect(canTransitionPayrollStatus(PayrollStatus.APPROVED, target)).toBe(false);
        expect(() => assertValidPayrollTransition(PayrollStatus.APPROVED, target)).toThrow(AppError);
        try {
          assertValidPayrollTransition(PayrollStatus.APPROVED, target);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('Terminal states: CANCELLED cannot transition to anything', () => {
    for (const target of allStatuses) {
      it(`forbids CANCELLED -> ${target}`, () => {
        expect(canTransitionPayrollStatus(PayrollStatus.CANCELLED, target)).toBe(false);
        expect(() => assertValidPayrollTransition(PayrollStatus.CANCELLED, target)).toThrow(AppError);
        try {
          assertValidPayrollTransition(PayrollStatus.CANCELLED, target);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('isEditablePayrollStatus', () => {
    it('returns true for DRAFT only', () => {
      expect(isEditablePayrollStatus(PayrollStatus.DRAFT)).toBe(true);
    });

    it('returns false for all non-DRAFT statuses', () => {
      expect(isEditablePayrollStatus(PayrollStatus.SUBMITTED)).toBe(false);
      expect(isEditablePayrollStatus(PayrollStatus.APPROVED)).toBe(false);
      expect(isEditablePayrollStatus(PayrollStatus.REJECTED)).toBe(false);
      expect(isEditablePayrollStatus(PayrollStatus.CANCELLED)).toBe(false);
    });
  });

  describe('isTerminalPayrollStatus', () => {
    it('returns true for APPROVED and CANCELLED', () => {
      expect(isTerminalPayrollStatus(PayrollStatus.APPROVED)).toBe(true);
      expect(isTerminalPayrollStatus(PayrollStatus.CANCELLED)).toBe(true);
    });

    it('returns false for non-terminal statuses', () => {
      expect(isTerminalPayrollStatus(PayrollStatus.DRAFT)).toBe(false);
      expect(isTerminalPayrollStatus(PayrollStatus.SUBMITTED)).toBe(false);
      expect(isTerminalPayrollStatus(PayrollStatus.REJECTED)).toBe(false);
    });
  });

  describe('assertPayrollIsEditable', () => {
    it('does not throw for DRAFT', () => {
      expect(() => assertPayrollIsEditable(PayrollStatus.DRAFT)).not.toThrow();
    });

    it('throws RECORD_NOT_EDITABLE for all other statuses', () => {
      const nonDrafts = [
        PayrollStatus.SUBMITTED,
        PayrollStatus.APPROVED,
        PayrollStatus.REJECTED,
        PayrollStatus.CANCELLED,
      ];
      for (const status of nonDrafts) {
        expect(() => assertPayrollIsEditable(status)).toThrow(AppError);
        try {
          assertPayrollIsEditable(status);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('RECORD_NOT_EDITABLE');
        }
      }
    });
  });

  describe('assertPayrollCanBeApproved', () => {
    it('does not throw for SUBMITTED', () => {
      expect(() => assertPayrollCanBeApproved(PayrollStatus.SUBMITTED)).not.toThrow();
    });

    it('throws INVALID_STATE_TRANSITION for all other statuses', () => {
      const invalid = [
        PayrollStatus.DRAFT,
        PayrollStatus.APPROVED,
        PayrollStatus.REJECTED,
        PayrollStatus.CANCELLED,
      ];
      for (const status of invalid) {
        expect(() => assertPayrollCanBeApproved(status)).toThrow(AppError);
        try {
          assertPayrollCanBeApproved(status);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      }
    });
  });

  describe('assertPayrollCanBeRejected', () => {
    it('does not throw for SUBMITTED', () => {
      expect(() => assertPayrollCanBeRejected(PayrollStatus.SUBMITTED)).not.toThrow();
    });

    it('throws INVALID_STATE_TRANSITION for all other statuses', () => {
      const invalid = [
        PayrollStatus.DRAFT,
        PayrollStatus.APPROVED,
        PayrollStatus.REJECTED,
        PayrollStatus.CANCELLED,
      ];
      for (const status of invalid) {
        expect(() => assertPayrollCanBeRejected(status)).toThrow(AppError);
        try {
          assertPayrollCanBeRejected(status);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      }
    });
  });

  describe('assertPayrollCanBeCancelled', () => {
    it('does not throw for DRAFT or SUBMITTED', () => {
      expect(() => assertPayrollCanBeCancelled(PayrollStatus.DRAFT)).not.toThrow();
      expect(() => assertPayrollCanBeCancelled(PayrollStatus.SUBMITTED)).not.toThrow();
    });

    it('throws INVALID_STATE_TRANSITION for APPROVED, REJECTED, and CANCELLED', () => {
      const invalid = [
        PayrollStatus.APPROVED,
        PayrollStatus.REJECTED,
        PayrollStatus.CANCELLED,
      ];
      for (const status of invalid) {
        expect(() => assertPayrollCanBeCancelled(status)).toThrow(AppError);
        try {
          assertPayrollCanBeCancelled(status);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      }
    });
  });
});
