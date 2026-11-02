'use client';

/**
 * components/progress-reports/linked-milestones-card.tsx
 *
 * Displays project milestones linked to a progress report (CR-08 / BD-17).
 *
 * Implements:
 * - Deterministic list of linked milestones sorted by orderIndex.
 * - Arabic status badge and target date.
 * - Clear empty state when no milestones are linked.
 * - Informative note explaining evidence linkage.
 *
 * RTL & Arabic first, CSS logical properties.
 */

import { Flag, Calendar } from 'lucide-react';
import type { ProgressReportLinkedMilestoneInfo } from '@/lib/progress-reports/types';

export interface LinkedMilestonesCardProps {
  milestones?: ProgressReportLinkedMilestoneInfo[] | undefined;
}

function getMilestoneStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return (
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          مكتملة
        </span>
      );
    case 'IN_PROGRESS':
      return (
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
          قيد التنفيذ
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 line-through">
          ملغاة
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          مخططة
        </span>
      );
  }
}

export function LinkedMilestonesCard({ milestones = [] }: LinkedMilestonesCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
      data-testid="linked-milestones-card"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold text-foreground">
            المحطات التخطيطية المرتبطة بالتقرير
          </h2>
        </div>
        <span
          className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
          data-testid="linked-milestones-count"
        >
          {milestones.length} محطات
        </span>
      </div>

      {milestones.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
          data-testid="no-linked-milestones"
        >
          لم يتم ربط هذا التقرير بأي محطات تخطيطية للمشروع.
        </div>
      ) : (
        <div className="space-y-2.5" data-testid="linked-milestones-list">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 text-xs"
                data-testid={`linked-milestone-item-${m.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                      #{m.orderIndex + 1}
                    </span>
                    <span className="font-semibold text-foreground">{m.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="size-3 text-muted-foreground" />
                    <span>التاريخ المستهدف: <strong className="font-mono">{m.targetDate}</strong></span>
                  </div>
                </div>

                <div>{getMilestoneStatusBadge(m.status)}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground pt-1">
            * يوفر هذا التقرير الميداني وما يحتويه من صور توثيقية أدلة إنجاز لدعم اعتماد هذه المحطات من قبل الإدارة.
          </p>
        </div>
      )}
    </div>
  );
}
