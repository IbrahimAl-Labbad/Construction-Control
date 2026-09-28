/**
 * lib/operational-dashboard/calculations.ts
 *
 * Pure domain calculations for the Operational Project Dashboard.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strictly adheres to BD-13-20:
 * - Pure function: takes two mandatory YYYY-MM-DD date strings.
 * - Zero default arguments. Zero clock reads (new Date() forbidden).
 * - Zero side effects.
 * - Same date returns 0.
 * - Past report returns positive integer (> 0).
 * - Tomorrow report (per Slice 10 1-day tolerance) returns -1.
 * - Zero clamp: No Math.max(0, ...) applied.
 */

/**
 * Pure calculation function for calendar day difference between businessToday and reportDate.
 *
 * @param reportDate - Calendar date of the report in YYYY-MM-DD format
 * @param businessToday - Current business calendar date in YYYY-MM-DD format (Asia/Riyadh)
 * @returns Integer difference in days (businessToday - reportDate).
 *          Same date = 0, yesterday = 1, tomorrow = -1.
 */
export function calculateDaysSinceReport(
  reportDate: string,
  businessToday: string,
): number {
  const [rYearStr, rMonthStr, rDayStr] = reportDate.slice(0, 10).split('-');
  const [tYearStr, tMonthStr, tDayStr] = businessToday.slice(0, 10).split('-');

  const rYear = Number(rYearStr);
  const rMonth = Number(rMonthStr);
  const rDay = Number(rDayStr);

  const tYear = Number(tYearStr);
  const tMonth = Number(tMonthStr);
  const tDay = Number(tDayStr);

  const reportUtc = Date.UTC(rYear, rMonth - 1, rDay);
  const todayUtc = Date.UTC(tYear, tMonth - 1, tDay);

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((todayUtc - reportUtc) / msPerDay);
}
