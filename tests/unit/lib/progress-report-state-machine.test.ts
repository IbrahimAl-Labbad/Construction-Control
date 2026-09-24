import { describe, it, expect } from 'vitest';
import { ProgressReportStatus } from '@prisma/client';
import {
  canTransitionProgressReportStatus,
  assertValidProgressReportTransition,
  getAllowedNextProgressReportStatuses,
  isEditableProgressReportStatus,
  isTerminalProgressReportStatus,
} from '@/lib/progress-reports/state-machine';
import { AppError } from '@/lib/errors';

describe('ProgressReport State Machine', () => {
  it('allows valid lifecycle transitions', () => {
    // DRAFT -> SUBMITTED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.DRAFT, ProgressReportStatus.SUBMITTED)).toBe(true);
    // DRAFT -> CANCELLED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.DRAFT, ProgressReportStatus.CANCELLED)).toBe(true);
    // SUBMITTED -> APPROVED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.SUBMITTED, ProgressReportStatus.APPROVED)).toBe(true);
    // SUBMITTED -> REJECTED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.SUBMITTED, ProgressReportStatus.REJECTED)).toBe(true);
    // SUBMITTED -> CANCELLED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.SUBMITTED, ProgressReportStatus.CANCELLED)).toBe(true);
    // REJECTED -> DRAFT
    expect(canTransitionProgressReportStatus(ProgressReportStatus.REJECTED, ProgressReportStatus.DRAFT)).toBe(true);
  });

  it('rejects invalid transitions', () => {
    // Cannot skip SUBMITTED directly from DRAFT to APPROVED
    expect(canTransitionProgressReportStatus(ProgressReportStatus.DRAFT, ProgressReportStatus.APPROVED)).toBe(false);
    // Cannot reject a DRAFT
    expect(canTransitionProgressReportStatus(ProgressReportStatus.DRAFT, ProgressReportStatus.REJECTED)).toBe(false);
    // APPROVED is strictly immutable — cannot transition to any other status
    expect(canTransitionProgressReportStatus(ProgressReportStatus.APPROVED, ProgressReportStatus.DRAFT)).toBe(false);
    expect(canTransitionProgressReportStatus(ProgressReportStatus.APPROVED, ProgressReportStatus.SUBMITTED)).toBe(false);
    expect(canTransitionProgressReportStatus(ProgressReportStatus.APPROVED, ProgressReportStatus.CANCELLED)).toBe(false);
    expect(canTransitionProgressReportStatus(ProgressReportStatus.APPROVED, ProgressReportStatus.REJECTED)).toBe(false);
    // CANCELLED is strictly terminal — cannot transition anywhere
    expect(canTransitionProgressReportStatus(ProgressReportStatus.CANCELLED, ProgressReportStatus.DRAFT)).toBe(false);
    expect(canTransitionProgressReportStatus(ProgressReportStatus.CANCELLED, ProgressReportStatus.SUBMITTED)).toBe(false);
    expect(canTransitionProgressReportStatus(ProgressReportStatus.CANCELLED, ProgressReportStatus.APPROVED)).toBe(false);
  });

  it('assertValidProgressReportTransition throws AppError for illegal transitions', () => {
    expect(() =>
      assertValidProgressReportTransition(ProgressReportStatus.APPROVED, ProgressReportStatus.DRAFT),
    ).toThrowError(AppError);

    try {
      assertValidProgressReportTransition(ProgressReportStatus.APPROVED, ProgressReportStatus.DRAFT);
    } catch (err) {
      expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
    }
  });

  it('identifies editable status correctly (DRAFT only)', () => {
    expect(isEditableProgressReportStatus(ProgressReportStatus.DRAFT)).toBe(true);
    expect(isEditableProgressReportStatus(ProgressReportStatus.SUBMITTED)).toBe(false);
    expect(isEditableProgressReportStatus(ProgressReportStatus.APPROVED)).toBe(false);
    expect(isEditableProgressReportStatus(ProgressReportStatus.REJECTED)).toBe(false);
    expect(isEditableProgressReportStatus(ProgressReportStatus.CANCELLED)).toBe(false);
  });

  it('identifies terminal statuses correctly (APPROVED and CANCELLED)', () => {
    expect(isTerminalProgressReportStatus(ProgressReportStatus.APPROVED)).toBe(true);
    expect(isTerminalProgressReportStatus(ProgressReportStatus.CANCELLED)).toBe(true);
    expect(isTerminalProgressReportStatus(ProgressReportStatus.DRAFT)).toBe(false);
    expect(isTerminalProgressReportStatus(ProgressReportStatus.SUBMITTED)).toBe(false);
    expect(isTerminalProgressReportStatus(ProgressReportStatus.REJECTED)).toBe(false);
  });

  it('returns allowed next statuses accurately', () => {
    expect(getAllowedNextProgressReportStatuses(ProgressReportStatus.DRAFT)).toEqual([
      ProgressReportStatus.SUBMITTED,
      ProgressReportStatus.CANCELLED,
    ]);
    expect(getAllowedNextProgressReportStatuses(ProgressReportStatus.APPROVED)).toEqual([]);
    expect(getAllowedNextProgressReportStatuses(ProgressReportStatus.CANCELLED)).toEqual([]);
  });
});
