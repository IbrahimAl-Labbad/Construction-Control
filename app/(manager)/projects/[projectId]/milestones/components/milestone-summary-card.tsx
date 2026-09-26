/**
 * app/(manager)/projects/[projectId]/milestones/components/milestone-summary-card.tsx
 *
 * KPI summary card for project milestones.
 * Displays total, completed, in-progress, planned, overdue count, and the next upcoming milestone.
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import { Flag, Clock, Calendar, AlertTriangle } from 'lucide-react';
import type { ProjectMilestoneSummaryDTO } from '@/lib/milestones';

interface MilestoneSummaryCardProps {
  summary: ProjectMilestoneSummaryDTO;
}

export function MilestoneSummaryCard({ summary }: MilestoneSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Flag className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground">
            ملخص ومؤشرات المعالم التعاقدية والتشغيلية
          </h2>
        </div>
        {summary.overdueCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
            data-testid="overdue-banner-badge"
          >
            <AlertTriangle className="size-3.5" />
            <span>{summary.overdueCount} معالم متأخرة</span>
          </span>
        )}
      </div>

      {/* KPI Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-xs font-medium text-muted-foreground">إجمالي المعالم</span>
          <p
            className="mt-1 text-xl font-bold text-foreground"
            data-testid="summary-total-count"
          >
            {summary.totalCount}
          </p>
        </div>

        {/* Planned */}
        <div className="rounded-lg border border-border/60 bg-slate-50/50 dark:bg-slate-900/30 p-3">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            مخططة
          </span>
          <p
            className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-200"
            data-testid="summary-planned-count"
          >
            {summary.plannedCount}
          </p>
        </div>

        {/* In Progress */}
        <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 dark:bg-blue-950/20 p-3">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            قيد التنفيذ
          </span>
          <p
            className="mt-1 text-xl font-bold text-blue-700 dark:text-blue-300"
            data-testid="summary-in-progress-count"
          >
            {summary.inProgressCount}
          </p>
        </div>

        {/* Completed */}
        <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            منجزة
          </span>
          <p
            className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300"
            data-testid="summary-completed-count"
          >
            {summary.completedCount}
          </p>
        </div>

        {/* Overdue */}
        <div
          className={`rounded-lg border p-3 ${
            summary.overdueCount > 0
              ? 'border-rose-300 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
              : 'border-border/60 bg-muted/30 text-muted-foreground'
          }`}
        >
          <span className="text-xs font-medium">متأخرة عن المستهدف</span>
          <p
            className={`mt-1 text-xl font-bold ${
              summary.overdueCount > 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-foreground'
            }`}
            data-testid="summary-overdue-count"
          >
            {summary.overdueCount}
          </p>
        </div>
      </div>

      {/* Next Upcoming Milestone */}
      <div className="rounded-lg border border-border bg-background p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Clock className="size-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-muted-foreground">
            المعلم القادم الأقرب:
          </span>
          {summary.nextUpcomingMilestone ? (
            <span
              className="text-sm font-bold text-foreground"
              data-testid="next-upcoming-title"
            >
              {summary.nextUpcomingMilestone.title}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              لا توجد معالم قادمة مجدولة
            </span>
          )}
        </div>

        {summary.nextUpcomingMilestone && (
          <div className="flex items-center gap-2 me-1">
            <span
              className="font-mono text-xs font-medium text-muted-foreground inline-flex items-center gap-1"
              data-testid="next-upcoming-target-date"
            >
              <Calendar className="size-3.5" />
              <span>{summary.nextUpcomingMilestone.targetDate}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
