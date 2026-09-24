import { describe, expect, it } from 'vitest';
import { AssignmentStatus } from '@prisma/client';
import {
  canTransitionAssignmentStatus,
  assertCanTransitionAssignmentStatus,
  isActiveAssignment,
  isInactiveAssignment,
} from '@/lib/project-team/state-machine';
import type { AppError } from '@/lib/errors';

describe('ProjectAssignment State Machine (Unit)', () => {
  describe('canTransitionAssignmentStatus', () => {
    it('allows ACTIVE -> INACTIVE transition', () => {
      expect(
        canTransitionAssignmentStatus(AssignmentStatus.ACTIVE, AssignmentStatus.INACTIVE),
      ).toBe(true);
    });

    it('allows INACTIVE -> ACTIVE transition', () => {
      expect(
        canTransitionAssignmentStatus(AssignmentStatus.INACTIVE, AssignmentStatus.ACTIVE),
      ).toBe(true);
    });

    it('disallows self-transition ACTIVE -> ACTIVE', () => {
      expect(
        canTransitionAssignmentStatus(AssignmentStatus.ACTIVE, AssignmentStatus.ACTIVE),
      ).toBe(false);
    });

    it('disallows self-transition INACTIVE -> INACTIVE', () => {
      expect(
        canTransitionAssignmentStatus(AssignmentStatus.INACTIVE, AssignmentStatus.INACTIVE),
      ).toBe(false);
    });
  });

  describe('assertCanTransitionAssignmentStatus', () => {
    it('does not throw for valid transitions', () => {
      expect(() =>
        assertCanTransitionAssignmentStatus(
          AssignmentStatus.ACTIVE,
          AssignmentStatus.INACTIVE,
        ),
      ).not.toThrow();

      expect(() =>
        assertCanTransitionAssignmentStatus(
          AssignmentStatus.INACTIVE,
          AssignmentStatus.ACTIVE,
        ),
      ).not.toThrow();
    });

    it('throws AppError with INVALID_STATE_TRANSITION for invalid transitions', () => {
      expect(() =>
        assertCanTransitionAssignmentStatus(
          AssignmentStatus.ACTIVE,
          AssignmentStatus.ACTIVE,
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'INVALID_STATE_TRANSITION',
        }) as AppError,
      );

      expect(() =>
        assertCanTransitionAssignmentStatus(
          AssignmentStatus.INACTIVE,
          AssignmentStatus.INACTIVE,
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'INVALID_STATE_TRANSITION',
        }) as AppError,
      );
    });
  });

  describe('Predicates', () => {
    it('isActiveAssignment returns true only for ACTIVE status', () => {
      expect(isActiveAssignment(AssignmentStatus.ACTIVE)).toBe(true);
      expect(isActiveAssignment(AssignmentStatus.INACTIVE)).toBe(false);
    });

    it('isInactiveAssignment returns true only for INACTIVE status', () => {
      expect(isInactiveAssignment(AssignmentStatus.INACTIVE)).toBe(true);
      expect(isInactiveAssignment(AssignmentStatus.ACTIVE)).toBe(false);
    });
  });
});
