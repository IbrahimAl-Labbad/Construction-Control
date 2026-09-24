'use client';

/**
 * components/progress-reports/progress-report-status-badge.tsx
 *
 * Status badge for Site Engineer Progress Reports.
 * Displays Arabic status text with consistent semantic colors.
 */

import type { ProgressReportStatus } from '@prisma/client';

export const PROGRESS_REPORT_STATUS_LABELS: Record<ProgressReportStatus, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغي',
};

const STATUS_STYLES: Record<ProgressReportStatus, string> = {
  DRAFT: 'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300',
  SUBMITTED: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400',
  APPROVED: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-destructive/30 bg-destructive/15 text-destructive',
  CANCELLED: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

interface ProgressReportStatusBadgeProps {
  status: ProgressReportStatus;
  className?: string;
}

export function ProgressReportStatusBadge({
  status,
  className = '',
}: ProgressReportStatusBadgeProps) {
  const label = PROGRESS_REPORT_STATUS_LABELS[status] ?? status;
  const style = STATUS_STYLES[status] ?? 'border-border bg-muted text-foreground';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}
      data-testid="progress-report-status-badge"
    >
      {label}
    </span>
  );
}
