/**
 * tests/unit/lib/commitment-state-machine.test.ts
 *
 * Unit tests for the Commitment state machine:
 * - Proves allowed transitions:
 *   DRAFT -> SUBMITTED
 *   SUBMITTED -> APPROVED, REJECTED
 *   REJECTED -> DRAFT
 * - Proves forbidden transitions and terminal immutability of APPROVED.
 */

import { describe, expect, it } from 'vitest';
import { CommitmentStatus } from '@prisma/client';

import {
  ALLOWED_COMMITMENT_TRANSITIONS,
  canTransitionCommitmentStatus,
  assertCanTransitionCommitmentStatus,
  getAllowedNextCommitmentStatuses,
} from '@/lib/commitments/state-machine';
import { AppError } from '@/lib/errors';

describe('Commitment State Machine', () => {
  it('defines the correct transition matrix', () => {
    expect(ALLOWED_COMMITMENT_TRANSITIONS[CommitmentStatus.DRAFT]).toEqual([
      CommitmentStatus.SUBMITTED,
    ]);
    expect(ALLOWED_COMMITMENT_TRANSITIONS[CommitmentStatus.SUBMITTED]).toEqual([
      CommitmentStatus.APPROVED,
      CommitmentStatus.REJECTED,
    ]);
    expect(ALLOWED_COMMITMENT_TRANSITIONS[CommitmentStatus.REJECTED]).toEqual([
      CommitmentStatus.DRAFT,
    ]);
    expect(ALLOWED_COMMITMENT_TRANSITIONS[CommitmentStatus.APPROVED]).toEqual([]);
  });

  describe('Allowed transitions', () => {
    it('allows DRAFT -> SUBMITTED', () => {
      expect(canTransitionCommitmentStatus(CommitmentStatus.DRAFT, CommitmentStatus.SUBMITTED)).toBe(true);
      expect(() =>
        assertCanTransitionCommitmentStatus(CommitmentStatus.DRAFT, CommitmentStatus.SUBMITTED),
      ).not.toThrow();
    });

    it('allows SUBMITTED -> APPROVED', () => {
      expect(canTransitionCommitmentStatus(CommitmentStatus.SUBMITTED, CommitmentStatus.APPROVED)).toBe(true);
      expect(() =>
        assertCanTransitionCommitmentStatus(CommitmentStatus.SUBMITTED, CommitmentStatus.APPROVED),
      ).not.toThrow();
    });

    it('allows SUBMITTED -> REJECTED', () => {
      expect(canTransitionCommitmentStatus(CommitmentStatus.SUBMITTED, CommitmentStatus.REJECTED)).toBe(true);
      expect(() =>
        assertCanTransitionCommitmentStatus(CommitmentStatus.SUBMITTED, CommitmentStatus.REJECTED),
      ).not.toThrow();
    });

    it('allows REJECTED -> DRAFT (reopen)', () => {
      expect(canTransitionCommitmentStatus(CommitmentStatus.REJECTED, CommitmentStatus.DRAFT)).toBe(true);
      expect(() =>
        assertCanTransitionCommitmentStatus(CommitmentStatus.REJECTED, CommitmentStatus.DRAFT),
      ).not.toThrow();
    });
  });

  describe('Forbidden transitions', () => {
    const invalidTransitions: Array<[CommitmentStatus, CommitmentStatus]> = [
      [CommitmentStatus.DRAFT, CommitmentStatus.APPROVED],
      [CommitmentStatus.DRAFT, CommitmentStatus.REJECTED],
      [CommitmentStatus.DRAFT, CommitmentStatus.DRAFT],
      [CommitmentStatus.SUBMITTED, CommitmentStatus.DRAFT],
      [CommitmentStatus.SUBMITTED, CommitmentStatus.SUBMITTED],
      [CommitmentStatus.REJECTED, CommitmentStatus.SUBMITTED],
      [CommitmentStatus.REJECTED, CommitmentStatus.APPROVED],
      [CommitmentStatus.REJECTED, CommitmentStatus.REJECTED],
      [CommitmentStatus.APPROVED, CommitmentStatus.DRAFT],
      [CommitmentStatus.APPROVED, CommitmentStatus.SUBMITTED],
      [CommitmentStatus.APPROVED, CommitmentStatus.REJECTED],
      [CommitmentStatus.APPROVED, CommitmentStatus.APPROVED],
    ];

    for (const [from, to] of invalidTransitions) {
      it(`forbids ${from} -> ${to}`, () => {
        expect(canTransitionCommitmentStatus(from, to)).toBe(false);
        expect(() => assertCanTransitionCommitmentStatus(from, to)).toThrow(AppError);
        try {
          assertCanTransitionCommitmentStatus(from, to);
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).code).toBe('INVALID_STATE_TRANSITION');
        }
      });
    }
  });

  describe('getAllowedNextCommitmentStatuses', () => {
    it('returns valid next statuses for each state', () => {
      expect(getAllowedNextCommitmentStatuses(CommitmentStatus.DRAFT)).toEqual([
        CommitmentStatus.SUBMITTED,
      ]);
      expect(getAllowedNextCommitmentStatuses(CommitmentStatus.SUBMITTED)).toEqual([
        CommitmentStatus.APPROVED,
        CommitmentStatus.REJECTED,
      ]);
      expect(getAllowedNextCommitmentStatuses(CommitmentStatus.REJECTED)).toEqual([
        CommitmentStatus.DRAFT,
      ]);
      expect(getAllowedNextCommitmentStatuses(CommitmentStatus.APPROVED)).toEqual([]);
    });
  });
});
