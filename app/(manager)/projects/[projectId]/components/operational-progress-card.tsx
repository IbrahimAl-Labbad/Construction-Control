import Link from 'next/link';
import {
  ClipboardCheck,
  ArrowUpRight,
  User,
  AlertCircle,
  Calendar,
  Clock,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import type { LatestProgressReportSnapshotDTO } from '@/lib/operational-dashboard/types';

interface OperationalProgressCardProps {
  progress: LatestProgressReportSnapshotDTO | null;
  projectId: string;
}

export function OperationalProgressCard({
  progress,
  projectId,
}: OperationalProgressCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
      data-testid="operational-progress-card"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ClipboardCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                الموقف الميداني ونسبة الإنجاز
              </h2>
              {progress && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  آخر تقرير معتمد
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة سير العمل الفعلي المعتمد في الموقع والملاحظات الفنية
            </p>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/progress`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          data-testid="view-progress-reports-button"
        >
          <span>سجل التقارير</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {!progress ? (
        <div
          className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground space-y-1.5"
          data-testid="empty-progress-state"
        >
          <FileText className="size-8 mx-auto text-muted-foreground/50" aria-hidden="true" />
          <p className="font-semibold text-foreground">لا يوجد تقرير إنجاز معتمد حالياً للمشروع</p>
          <p>سيتم عرض ملخص الإنجاز الميداني ونسب التنفيذ فور اعتماد مهندس الموقع لأول تقرير إنجاز دوري.</p>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          {/* Header Snapshot info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-muted/30 p-3 border border-border/80">
            <div>
              <span className="text-xs text-muted-foreground block">عنوان التقرير الأخير</span>
              <span className="font-bold text-sm text-foreground">{progress.title}</span>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded bg-background border border-border text-foreground">
                <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {progress.reportDate}
              </span>
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-muted text-muted-foreground font-medium">
                <Clock className="size-3" aria-hidden="true" />
                {progress.daysSinceReport === 0
                  ? 'اليوم'
                  : progress.daysSinceReport === 1
                  ? 'منذ يوم'
                  : progress.daysSinceReport === -1
                  ? 'تاريخ الغد (معتمد)'
                  : `منذ ${progress.daysSinceReport} يوم`}
              </span>
            </div>
          </div>

          {/* Progress Percentage Progress Bar */}
          {progress.progressPercentage !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-muted-foreground">نسبة الإنجاز التقديرية الذاتية للموقع:</span>
                <span
                  className="font-mono text-sm font-bold text-primary"
                  data-testid="progress-percentage-value"
                >
                  {progress.progressPercentage}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress.progressPercentage))}%` }}
                />
              </div>
            </div>
          )}

          {/* Reporter & Blockers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 flex items-center gap-2">
              <User className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <div>
                <span className="text-muted-foreground block text-[11px]">مُعد التقرير (مهندس الموقع)</span>
                <span className="font-semibold text-foreground">{progress.createdBy.name}</span>
              </div>
            </div>

            {progress.nextPeriodPlan && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <span className="text-muted-foreground block text-[11px] font-medium">خطة الفترة القادمة</span>
                <p className="text-foreground line-clamp-2 mt-0.5">{progress.nextPeriodPlan}</p>
              </div>
            )}
          </div>

          {/* Site Blockers Alert Box */}
          {progress.blockers && (
            <div
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300 space-y-1"
              data-testid="progress-blockers-alert"
            >
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>المعوقات والمخاطر الميدانية المسجلة:</span>
              </div>
              <p className="text-xs leading-relaxed">{progress.blockers}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
