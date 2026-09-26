import { describe, expect, it } from 'vitest';
import { MilestoneStatus } from '@prisma/client';
import {
  ALLOWED_MILESTONE_TRANSITIONS,
  canTransitionMilestoneStatus,
  assertCanTransitionMilestoneStatus,
  getAllowedNextMilestoneStatuses,
  isEditableMilestoneStatus,
  isTerminalMilestoneStatus,
  canSoftDeleteMilestoneStatus,
} from '@/lib/milestones/state-machine';
import { AppError } from '@/lib/errors';

describe('Milestone State Machine (Unit Tests)', () => {
  const { PLANNED, IN_PROGRESS, COMPLETED, CANCELLED } = MilestoneStatus;

  it('exposes ALLOWED_MILESTONE_TRANSITIONS record', () => {
    expect(ALLOWED_MILESTONE_TRANSITIONS).toBeDefined();
    expect(ALLOWED_MILESTONE_TRANSITIONS[PLANNED]).toContain(IN_PROGRESS);
  });

  describe('Allowed transitions', () => {
    it('allows PLANNED -> IN_PROGRESS', () => {
      expect(canTransitionMilestoneStatus(PLANNED, IN_PROGRESS)).toBe(true);
      expect(() => assertCanTransitionMilestoneStatus(PLANNED, IN_PROGRESS)).not.toThrow();
    });

    it('allows PLANNED -> COMPLETED', () => {
      expect(canTransitionMilestoneStatus(PLANNED, COMPLETED)).toBe(true);
      expect(() => assertCanTransitionMilestoneStatus(PLANNED, COMPLETED)).not.toThrow();
    });

    it('allows PLANNED -> CANCELLED', () => {
      expect(canTransitionMilestoneStatus(PLANNED, CANCELLED)).toBe(true);
      expect(() => assertCanTransitionMilestoneStatus(PLANNED, CANCELLED)).not.toThrow();
    });

    it('allows IN_PROGRESS -> COMPLETED', () => {
      expect(canTransitionMilestoneStatus(IN_PROGRESS, COMPLETED)).toBe(true);
      expect(() => assertCanTransitionMilestoneStatus(IN_PROGRESS, COMPLETED)).not.toThrow();
    });

    it('allows IN_PROGRESS -> CANCELLED', () => {
      expect(canTransitionMilestoneStatus(IN_PROGRESS, CANCELLED)).toBe(true);
      expect(() => assertCanTransitionMilestoneStatus(IN_PROGRESS, CANCELLED)).not.toThrow();
    });
  });

  describe('Forbidden transitions', () => {
    it('forbids COMPLETED -> anything (terminal immutable)', () => {
      expect(canTransitionMilestoneStatus(COMPLETED, PLANNED)).toBe(false);
      expect(canTransitionMilestoneStatus(COMPLETED, IN_PROGRESS)).toBe(false);
      expect(canTransitionMilestoneStatus(COMPLETED, CANCELLED)).toBe(false);
      expect(canTransitionMilestoneStatus(COMPLETED, COMPLETED)).toBe(false);

      expect(() => assertCanTransitionMilestoneStatus(COMPLETED, IN_PROGRESS)).toThrow(AppError);
    });

    it('forbids CANCELLED -> anything (terminal immutable)', () => {
      expect(canTransitionMilestoneStatus(CANCELLED, PLANNED)).toBe(false);
      expect(canTransitionMilestoneStatus(CANCELLED, IN_PROGRESS)).toBe(false);
      expect(canTransitionMilestoneStatus(CANCELLED, COMPLETED)).toBe(false);
      expect(canTransitionMilestoneStatus(CANCELLED, CANCELLED)).toBe(false);

      expect(() => assertCanTransitionMilestoneStatus(CANCELLED, PLANNED)).toThrow(AppError);
    });

    it('forbids IN_PROGRESS -> PLANNED (reopening backwards)', () => {
      expect(canTransitionMilestoneStatus(IN_PROGRESS, PLANNED)).toBe(false);
      expect(() => assertCanTransitionMilestoneStatus(IN_PROGRESS, PLANNED)).toThrow(AppError);
    });
  });

  describe('getAllowedNextMilestoneStatuses helper', () => {
    it('returns valid arrays for each state', () => {
      expect(getAllowedNextMilestoneStatuses(PLANNED)).toEqual([
        IN_PROGRESS,
        COMPLETED,
        CANCELLED,
      ]);
      expect(getAllowedNextMilestoneStatuses(IN_PROGRESS)).toEqual([
        COMPLETED,
        CANCELLED,
      ]);
      expect(getAllowedNextMilestoneStatuses(COMPLETED)).toEqual([]);
      expect(getAllowedNextMilestoneStatuses(CANCELLED)).toEqual([]);
    });
  });

  describe('isEditableMilestoneStatus', () => {
    it('returns true for PLANNED and IN_PROGRESS, false for COMPLETED and CANCELLED', () => {
      expect(isEditableMilestoneStatus(PLANNED)).toBe(true);
      expect(isEditableMilestoneStatus(IN_PROGRESS)).toBe(true);
      expect(isEditableMilestoneStatus(COMPLETED)).toBe(false);
      expect(isEditableMilestoneStatus(CANCELLED)).toBe(false);
    });
  });

  describe('isTerminalMilestoneStatus', () => {
    it('returns true for COMPLETED and CANCELLED, false for PLANNED and IN_PROGRESS', () => {
      expect(isTerminalMilestoneStatus(COMPLETED)).toBe(true);
      expect(isTerminalMilestoneStatus(CANCELLED)).toBe(true);
      expect(isTerminalMilestoneStatus(PLANNED)).toBe(false);
      expect(isTerminalMilestoneStatus(IN_PROGRESS)).toBe(false);
    });
  });

  describe('canSoftDeleteMilestoneStatus (BD-12-05)', () => {
    it('allows soft deletion ONLY for PLANNED status', () => {
      expect(canSoftDeleteMilestoneStatus(PLANNED)).toBe(true);
      expect(canSoftDeleteMilestoneStatus(IN_PROGRESS)).toBe(false);
      expect(canSoftDeleteMilestoneStatus(COMPLETED)).toBe(false);
      expect(canSoftDeleteMilestoneStatus(CANCELLED)).toBe(false);
    });
  });
});
