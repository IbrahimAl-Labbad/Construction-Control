import Link from 'next/link';
import { Flag, ArrowUpRight, AlertTriangle, Calendar } from 'lucide-react';
import type { ProjectMilestonesSnapshotDTO } from '@/lib/operational-dashboard/types';

interface OperationalMilestonesCardProps {
  milestones: ProjectMilestonesSnapshotDTO;
  projectId: string;
}

export function OperationalMilestonesCard({
  milestones,
  projectId,
}: OperationalMilestonesCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
      data-testid="operational-milestones-card"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Flag className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                المعالم التخطيطية للمشروع
              </h2>
              <span
                className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                data-testid="milestones-total-count"
              >
                {milestones.totalCount} معلماً
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة المحطات الرئيسية ومؤشرات الالتزام بالجدول الزمني • <span data-testid="project-milestones-summary">{milestones.completedCount} من {milestones.totalCount} منجز</span>
            </p>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/milestones`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <span>إدارة المعالم</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* Overdue alert indicator if overdueCount > 0 */}
      {milestones.overdueCount > 0 && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium flex items-center justify-between"
          data-testid="milestones-overdue-alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              يوجد <strong>{milestones.overdueCount}</strong> من المعالم تجاوزت تاريخ الاستحقاق دون اكتمال!
            </span>
          </div>
          <Link
            href={`/projects/${projectId}/milestones`}
            className="text-xs font-bold underline hover:opacity-80"
          >
            مراجعة المعالم المتأخرة
          </Link>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-center">
          <span className="text-xs text-muted-foreground block">مكتملة</span>
          <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {milestones.completedCount}
          </span>
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-center">
          <span className="text-xs text-muted-foreground block">قيد التنفيذ</span>
          <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
            {milestones.inProgressCount}
          </span>
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-center">
          <span className="text-xs text-muted-foreground block">مخططة</span>
          <span className="text-lg font-bold font-mono text-foreground">
            {milestones.plannedCount}
          </span>
        </div>
        <div className={`rounded-lg border p-2.5 text-center ${
          milestones.overdueCount > 0
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border/80 bg-muted/20 text-muted-foreground'
        }`}>
          <span className="text-xs block">متأخرة</span>
          <span className={`text-lg font-bold font-mono ${milestones.overdueCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {milestones.overdueCount}
          </span>
        </div>
      </div>

      {/* Next Upcoming Milestone */}
      <div className="rounded-lg border border-border/80 bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-muted-foreground flex items-center gap-1.5 shrink-0">
          <Calendar className="size-3.5 text-primary" aria-hidden="true" />
          المعلم القادم المستحق:
        </span>
        {milestones.nextUpcomingMilestone ? (
          <div className="flex items-center gap-2" data-testid="next-upcoming-milestone">
            <span className="font-bold text-foreground">
              {milestones.nextUpcomingMilestone.title}
            </span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-background border border-border text-muted-foreground">
              {milestones.nextUpcomingMilestone.targetDate}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">
            لا توجد معالم قادمة مجدولة
          </span>
        )}
      </div>
    </div>
  );
}
