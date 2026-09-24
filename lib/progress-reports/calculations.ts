/**
 * lib/progress-reports/calculations.ts
 *
 * Pure domain calculation and normalization helpers for Progress Reports.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 */

import { Prisma } from '@prisma/client';

/**
 * Normalizes a date or date string into a YYYY-MM-DD string.
 */
export function formatReportDateString(date: Date | string): string {
  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return the first 10 characters
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
  const dateStr = formatReportDateString(date);
  const parts = dateStr.split('-');
  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '1', 10) - 1;
  const day = parseInt(parts[2] ?? '1', 10);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Builds the composite business uniqueness key string:
 * (projectId, reportDate [YYYY-MM-DD], createdById).
 */
export function buildProgressReportDuplicateKey(params: {
  projectId: string;
  reportDate: Date | string;
  createdById: string;
}): string {
  const dateStr = formatReportDateString(params.reportDate);
  return `${params.projectId}:${dateStr}:${params.createdById}`;
}

/**
 * Targeted P2002 check:
 * Returns true ONLY if the PrismaClientKnownRequestError represents a unique constraint
 * violation on (projectId, reportDate, createdById).
 * Prevents generic mapping of unrelated P2002 violations to DUPLICATE_PROGRESS_REPORT.
 */
export function isProgressReportUniqueConstraintViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return (
        target.includes('projectId') &&
        target.includes('reportDate') &&
        target.includes('createdById')
      );
    }
    if (typeof target === 'string') {
      return (
        target.includes('projectId') &&
        target.includes('reportDate') &&
        target.includes('createdById')
      );
    }
  }
  return false;
}
