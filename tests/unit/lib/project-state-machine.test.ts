/**
 * tests/unit/lib/project-state-machine.test.ts
 *
 * Unit tests for the Project Status State Machine.
 *
 * Covers:
 * - All valid transitions
 * - All invalid transitions (including terminal states)
 * - canTransitionProjectStatus (returns boolean)
 * - assertCanTransitionProjectStatus (throws on invalid)
 * - getAllowedNextStatuses (returns correct sets)
 */

import { describe, expect, it } from 'vitest';
import { ProjectStatus } from '@prisma/client';

import {
  canTransitionProjectStatus,
  assertCanTransitionProjectStatus,
  getAllowedNextStatuses,
} from '@/lib/projects/state-machine';
import { AppError } from '@/lib/errors';

const { PLANNED, ACTIVE, ON_HOLD, COMPLETED, CANCELLED } = ProjectStatus;

describe('Project Status State Machine', () => {
  // -------------------------------------------------------------------------
  // canTransitionProjectStatus
  // -------------------------------------------------------------------------
  describe('canTransitionProjectStatus', () => {
    // Valid transitions
    it('PLANNED → ACTIVE is allowed', () => {
      expect(canTransitionProjectStatus(PLANNED, ACTIVE)).toBe(true);
    });

    it('PLANNED → CANCELLED is allowed', () => {
      expect(canTransitionProjectStatus(PLANNED, CANCELLED)).toBe(true);
    });

    it('ACTIVE → ON_HOLD is allowed', () => {
      expect(canTransitionProjectStatus(ACTIVE, ON_HOLD)).toBe(true);
    });

    it('ACTIVE → COMPLETED is allowed', () => {
      expect(canTransitionProjectStatus(ACTIVE, COMPLETED)).toBe(true);
    });

    it('ACTIVE → CANCELLED is allowed', () => {
      expect(canTransitionProjectStatus(ACTIVE, CANCELLED)).toBe(true);
    });

    it('ON_HOLD → ACTIVE is allowed', () => {
      expect(canTransitionProjectStatus(ON_HOLD, ACTIVE)).toBe(true);
    });

    it('ON_HOLD → CANCELLED is allowed', () => {
      expect(canTransitionProjectStatus(ON_HOLD, CANCELLED)).toBe(true);
    });

    // Invalid transitions — skipping non-adjacent states
    it('PLANNED → COMPLETED is NOT allowed', () => {
      expect(canTransitionProjectStatus(PLANNED, COMPLETED)).toBe(false);
    });

    it('PLANNED → ON_HOLD is NOT allowed', () => {
      expect(canTransitionProjectStatus(PLANNED, ON_HOLD)).toBe(false);
    });

    it('ON_HOLD → COMPLETED is NOT allowed', () => {
      expect(canTransitionProjectStatus(ON_HOLD, COMPLETED)).toBe(false);
    });

    // Terminal states
    it('COMPLETED → ACTIVE is NOT allowed (terminal)', () => {
      expect(canTransitionProjectStatus(COMPLETED, ACTIVE)).toBe(false);
    });

    it('COMPLETED → CANCELLED is NOT allowed (terminal)', () => {
      expect(canTransitionProjectStatus(COMPLETED, CANCELLED)).toBe(false);
    });

    it('CANCELLED → ACTIVE is NOT allowed (terminal)', () => {
      expect(canTransitionProjectStatus(CANCELLED, ACTIVE)).toBe(false);
    });

    it('CANCELLED → PLANNED is NOT allowed (terminal)', () => {
      expect(canTransitionProjectStatus(CANCELLED, PLANNED)).toBe(false);
    });

    // Self-transitions
    it('PLANNED → PLANNED (self) is NOT allowed', () => {
      expect(canTransitionProjectStatus(PLANNED, PLANNED)).toBe(false);
    });

    it('ACTIVE → ACTIVE (self) is NOT allowed', () => {
      expect(canTransitionProjectStatus(ACTIVE, ACTIVE)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // assertCanTransitionProjectStatus
  // -------------------------------------------------------------------------
  describe('assertCanTransitionProjectStatus', () => {
    it('does not throw for a valid transition', () => {
      expect(() => assertCanTransitionProjectStatus(PLANNED, ACTIVE)).not.toThrow();
      expect(() => assertCanTransitionProjectStatus(ACTIVE, COMPLETED)).not.toThrow();
      expect(() => assertCanTransitionProjectStatus(ON_HOLD, ACTIVE)).not.toThrow();
    });

    it('throws AppError INVALID_STATE_TRANSITION for an invalid transition', () => {
      expect(() => assertCanTransitionProjectStatus(PLANNED, COMPLETED)).toThrow(AppError);
      expect(() => assertCanTransitionProjectStatus(PLANNED, COMPLETED)).toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });

    it('throws for terminal COMPLETED state', () => {
      expect(() => assertCanTransitionProjectStatus(COMPLETED, ACTIVE)).toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });

    it('throws for terminal CANCELLED state', () => {
      expect(() => assertCanTransitionProjectStatus(CANCELLED, PLANNED)).toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });

    it('throws for self-transition', () => {
      expect(() => assertCanTransitionProjectStatus(ACTIVE, ACTIVE)).toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getAllowedNextStatuses
  // -------------------------------------------------------------------------
  describe('getAllowedNextStatuses', () => {
    it('PLANNED can transition to ACTIVE and CANCELLED only', () => {
      const allowed = getAllowedNextStatuses(PLANNED);
      expect(allowed).toHaveLength(2);
      expect(allowed).toContain(ACTIVE);
      expect(allowed).toContain(CANCELLED);
      expect(allowed).not.toContain(COMPLETED);
      expect(allowed).not.toContain(ON_HOLD);
    });

    it('ACTIVE can transition to ON_HOLD, COMPLETED, CANCELLED', () => {
      const allowed = getAllowedNextStatuses(ACTIVE);
      expect(allowed).toHaveLength(3);
      expect(allowed).toContain(ON_HOLD);
      expect(allowed).toContain(COMPLETED);
      expect(allowed).toContain(CANCELLED);
    });

    it('ON_HOLD can transition to ACTIVE and CANCELLED only', () => {
      const allowed = getAllowedNextStatuses(ON_HOLD);
      expect(allowed).toHaveLength(2);
      expect(allowed).toContain(ACTIVE);
      expect(allowed).toContain(CANCELLED);
    });

    it('COMPLETED has no allowed transitions (terminal)', () => {
      const allowed = getAllowedNextStatuses(COMPLETED);
      expect(allowed).toHaveLength(0);
    });

    it('CANCELLED has no allowed transitions (terminal)', () => {
      const allowed = getAllowedNextStatuses(CANCELLED);
      expect(allowed).toHaveLength(0);
    });
  });
});
