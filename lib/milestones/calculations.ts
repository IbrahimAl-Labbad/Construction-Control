/**
 * lib/milestones/calculations.ts
 *
 * Pure domain calculations and date normalization helpers for Project Milestones.
 * Client-safe — no direct database or server-only runtime dependencies.
 *
 * Vertical Slice 12 — Project Planning & Milestones.
 * Follows AGENTS.md and BD-12-07 (Business Today semantics).
 */

import { MilestoneStatus } from '@prisma/client';

/**
 * Returns the current operational business calendar date string in YYYY-MM-DD format.
 * Defaults to 'Asia/Riyadh' (Saudi Arabia timezone) per BD-12-07.
 *
 * Guarantees zero midnight boundary skew between server UTC and project site calendar.
 */
export function getBusinessTodayDateString(timeZone: string = 'Asia/Riyadh'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Normalizes a date or date string into a clean YYYY-MM-DD string.
 */
export function formatMilestoneDateString(date: Date | string): string {
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return trimmed;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Converts a date or date string to a UTC midnight Date object suitable for Prisma @db.Date.
 */
export function toCalendarDate(date: Date | string): Date {
  const dateStr = formatMilestoneDateString(date);
  const parts = dateStr.split('-');
  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '1', 10) - 1;
  const day = parseInt(parts[2] ?? '1', 10);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Calculates whether a milestone is overdue (BD-12-04 / BD-12-07).
 *
 * Rules:
 * - If status is COMPLETED or CANCELLED => false (terminal states never overdue)
 * - If status is PLANNED or IN_PROGRESS => true if targetDate < businessToday
 *
 * Pure calculation — not stored in database.
 */
export function isMilestoneOverdue(
  targetDate: string,
  status: MilestoneStatus,
  businessToday: string = getBusinessTodayDateString(),
): boolean {
  if (status === MilestoneStatus.COMPLETED || status === MilestoneStatus.CANCELLED) {
    return false;
  }
  return targetDate < businessToday;
}
