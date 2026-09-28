/**
 * tests/unit/lib/operational-dashboard-calculations.test.ts
 *
 * Unit tests for pure calculations of Operational Project Dashboard.
 * Vertical Slice 13 — Operational Project Dashboard.
 */

import { describe, expect, it } from 'vitest';
import { calculateDaysSinceReport } from '@/lib/operational-dashboard/calculations';

describe('Operational Project Dashboard — Pure Calculations', () => {
  describe('calculateDaysSinceReport', () => {
    it('returns 0 when report date matches business today exactly', () => {
      expect(calculateDaysSinceReport('2026-09-27', '2026-09-27')).toBe(0);
    });

    it('returns 1 when report date was yesterday', () => {
      expect(calculateDaysSinceReport('2026-09-26', '2026-09-27')).toBe(1);
    });

    it('returns 7 when report date was 7 days ago', () => {
      expect(calculateDaysSinceReport('2026-09-20', '2026-09-27')).toBe(7);
    });

    it('returns -1 when report date is tomorrow (Slice 10 1-day future tolerance)', () => {
      expect(calculateDaysSinceReport('2026-09-28', '2026-09-27')).toBe(-1);
    });

    it('correctly calculates difference across month boundaries (non-leap year)', () => {
      // 2026 is not a leap year, February has 28 days
      expect(calculateDaysSinceReport('2026-02-28', '2026-03-01')).toBe(1);
      expect(calculateDaysSinceReport('2026-02-27', '2026-03-01')).toBe(2);
    });

    it('correctly calculates difference across month boundaries in leap year', () => {
      // 2024 is a leap year, February has 29 days
      expect(calculateDaysSinceReport('2024-02-28', '2024-03-01')).toBe(2);
      expect(calculateDaysSinceReport('2024-02-29', '2024-03-01')).toBe(1);
    });

    it('correctly calculates difference across year boundary', () => {
      expect(calculateDaysSinceReport('2025-12-31', '2026-01-01')).toBe(1);
      expect(calculateDaysSinceReport('2025-12-25', '2026-01-01')).toBe(7);
      expect(calculateDaysSinceReport('2026-01-01', '2025-12-31')).toBe(-1);
    });

    it('handles ISO timestamp strings by slicing first 10 characters', () => {
      expect(calculateDaysSinceReport('2026-09-20T12:00:00.000Z', '2026-09-27')).toBe(7);
    });
  });
});
