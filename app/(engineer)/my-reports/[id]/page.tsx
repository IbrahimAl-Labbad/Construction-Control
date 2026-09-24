import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProgressReport } from '@/lib/progress-reports';
import { ProgressReportStatusBadge } from '@/components/progress-reports';
import { EngineerReportActions } from './components/engineer-report-actions';
import { AppError } from '@/lib/errors';
import {
  ArrowRight,
  Calendar,
  FolderKanban,
  Clock,
  XCircle,
  Ban,
  AlertTriangle,
  CloudSun,
  FileText,
} from 'lucide-react';

interface EngineerReportDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'تفاصيل تقرير التقدم الميداني',
  description: 'عرض بيانات تقرير التقدم الميداني والأنشطة المنفذة',
};

export default async function EngineerReportDetailPage({ params }: EngineerReportDetailPageProps) {
  const { id } = await params;

  let report;
  try {
    report = await getProgressReport(id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <Link
            href="/my-reports"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowRight className="size-3.5" aria-hidden="true" />
            <span>العودة لقائمة تقاريري</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {report.reportDate}
            </span>
            <ProgressReportStatusBadge status={report.status} />
          </div>
          <h1 className="text-xl font-bold text-foreground mt-1" data-testid="report-title">
            {report.title}
          </h1>
        </div>

        {/* Action Buttons */}
        <EngineerReportActions reportId={report.id} status={report.status} />
      </div>

      {/* Rejection Notice Banner */}
      {report.status === 'REJECTED' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4" data-testid="rejection-notice-banner">
          <div className="flex items-start gap-3">
            <XCircle className="size-5 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-destructive">تم رفض التقرير من قبل مدير المشروع</h2>
              <p className="text-xs text-foreground leading-relaxed">
                {report.rejectionReason || 'لم يحدد المدير سبباً للرفض.'}
              </p>
              {report.rejectedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  تاريخ الرفض: {new Date(report.rejectedAt).toLocaleString('ar-SA')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Notice Banner */}
      {report.status === 'CANCELLED' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Ban className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">التقرير ملغي نهائياً</h2>
              <p className="text-xs text-foreground mt-0.5">
                {report.cancellationReason || 'تم إلغاء هذا التقرير.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Core Report Content Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
        {/* Project & Overview info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-b border-border pb-5">
          <div>
            <span className="text-xs text-muted-foreground block">المشروع</span>
            <div className="flex items-center gap-1.5 mt-1 font-semibold text-foreground text-sm">
              <FolderKanban className="size-4 text-primary" aria-hidden="true" />
              <span>{report.project?.name}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground block mt-0.5">
              كود: {report.project?.code}
            </span>
          </div>

          <div>
            <span className="text-xs text-muted-foreground block">تاريخ التغطية الميدانية</span>
            <div className="flex items-center gap-1.5 mt-1 font-mono font-medium text-foreground text-sm">
              <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{report.reportDate}</span>
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground block">نسبة الإنجاز التقديرية</span>
            <div className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono">
              {report.progressPercentage !== null ? `${report.progressPercentage}%` : '—'}
            </div>
          </div>
        </div>

        {/* Narrative: Work Description */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <span>وصف الأعمال المنجزة</span>
          </h2>
          <div className="rounded-lg bg-muted/40 p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {report.workDescription}
          </div>
        </div>

        {/* Optional sections grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Site Blockers */}
          {report.blockers && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                <span>المعوقات والملاحظات</span>
              </h2>
              <div className="rounded-lg bg-muted/40 p-3.5 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {report.blockers}
              </div>
            </div>
          )}

          {/* Next Period Plan */}
          {report.nextPeriodPlan && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="size-4 text-blue-500" aria-hidden="true" />
                <span>خطة الفترة القادمة</span>
              </h2>
              <div className="rounded-lg bg-muted/40 p-3.5 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {report.nextPeriodPlan}
              </div>
            </div>
          )}
        </div>

        {/* Weather condition */}
        {report.weatherCondition && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
            <CloudSun className="size-4 text-amber-500" aria-hidden="true" />
            <span>حالة الطقس وظروف الموقع:</span>
            <span className="font-medium text-foreground">{report.weatherCondition}</span>
          </div>
        )}
      </div>

      {/* Audit & Tracking Info Card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
        <div>
          <span>المهندس مُعد التقرير: </span>
          <span className="font-semibold text-foreground">{report.createdBy?.name}</span>
        </div>
        <div>
          <span>تاريخ إنشاء المسودة: </span>
          <span className="font-mono text-foreground">
            {new Date(report.createdAt).toLocaleString('ar-SA')}
          </span>
        </div>
        {report.submittedAt && (
          <div>
            <span>تاريخ التقديم للمراجعة: </span>
            <span className="font-mono text-foreground">
              {new Date(report.submittedAt).toLocaleString('ar-SA')}
            </span>
          </div>
        )}
        {report.approvedAt && (
          <div>
            <span>الاعتماد: </span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              تم الاعتماد بواسطة {report.approvedBy?.name} في {new Date(report.approvedAt).toLocaleString('ar-SA')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
