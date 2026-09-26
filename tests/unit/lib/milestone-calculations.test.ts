import { describe, expect, it } from 'vitest';
import { MilestoneStatus } from '@prisma/client';
import {
  getBusinessTodayDateString,
  formatMilestoneDateString,
  toCalendarDate,
  isMilestoneOverdue,
} from '@/lib/milestones/calculations';

describe('Milestone Calculations & Date Helpers (Unit Tests)', () => {
  describe('getBusinessTodayDateString', () => {
    it('returns a valid YYYY-MM-DD string formatted in Asia/Riyadh', () => {
      const today = getBusinessTodayDateString('Asia/Riyadh');
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatMilestoneDateString', () => {
    it('extracts YYYY-MM-DD from string or Date object', () => {
      expect(formatMilestoneDateString('2026-09-24T12:00:00.000Z')).toBe('2026-09-24');
      expect(formatMilestoneDateString('2026-09-24')).toBe('2026-09-24');

      const d = new Date(Date.UTC(2026, 8, 24));
      expect(formatMilestoneDateString(d)).toBe('2026-09-24');
    });
  });

  describe('toCalendarDate', () => {
    it('creates UTC midnight Date from string', () => {
      const d = toCalendarDate('2026-10-15');
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(9);
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    });
  });

  describe('isMilestoneOverdue (BD-12-07)', () => {
    const businessToday = '2026-09-24';

    it('returns true when status is PLANNED and targetDate < businessToday', () => {
      expect(isMilestoneOverdue('2026-09-20', MilestoneStatus.PLANNED, businessToday)).toBe(true);
    });

    it('returns true when status is IN_PROGRESS and targetDate < businessToday', () => {
      expect(isMilestoneOverdue('2026-09-23', MilestoneStatus.IN_PROGRESS, businessToday)).toBe(true);
    });

    it('returns false when targetDate >= businessToday', () => {
      expect(isMilestoneOverdue('2026-09-24', MilestoneStatus.PLANNED, businessToday)).toBe(false);
      expect(isMilestoneOverdue('2026-09-25', MilestoneStatus.PLANNED, businessToday)).toBe(false);
      expect(isMilestoneOverdue('2026-10-01', MilestoneStatus.IN_PROGRESS, businessToday)).toBe(false);
    });

    it('returns false for COMPLETED even if targetDate is in the past', () => {
      expect(isMilestoneOverdue('2026-08-01', MilestoneStatus.COMPLETED, businessToday)).toBe(false);
    });

    it('returns false for CANCELLED even if targetDate is in the past', () => {
      expect(isMilestoneOverdue('2026-08-01', MilestoneStatus.CANCELLED, businessToday)).toBe(false);
    });
  });
});
