import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgressReportStatus } from '@prisma/client';
import { getEngineerProgressReports } from '@/lib/progress-reports';
import { ProgressReportStatusBadge } from '@/components/progress-reports';
import { ClipboardList, Plus, Calendar, FolderKanban, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'تقارير التقدم الميداني',
  description: 'استعراض وإدارة تقارير التقدم الميداني الخاصة بالمهندس',
};

interface MyReportsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MyReportsPage({ searchParams }: MyReportsPageProps) {
  const params = await searchParams;
  const currentStatus = params.status as ProgressReportStatus | undefined;

  const reports = await getEngineerProgressReports(
    currentStatus ? { status: currentStatus } : undefined,
  );

  const statusFilters: Array<{ label: string; value: string | undefined }> = [
    { label: 'الكل', value: undefined },
    { label: 'مسودة', value: ProgressReportStatus.DRAFT },
    { label: 'قيد المراجعة', value: ProgressReportStatus.SUBMITTED },
    { label: 'معتمد', value: ProgressReportStatus.APPROVED },
    { label: 'مرفوض', value: ProgressReportStatus.REJECTED },
    { label: 'ملغي', value: ProgressReportStatus.CANCELLED },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">
              تقارير التقدم الميداني
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              إعداد ومتابعة تقارير الإنجاز وسير الأعمال في المواقع الإنشائية
            </p>
          </div>
        </div>

        <Link
          href="/my-reports/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          data-testid="create-report-button"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>إنشاء تقرير جديد</span>
        </Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2" role="tablist">
        {statusFilters.map((filter) => {
          const isActive = currentStatus === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/my-reports?status=${filter.value}` : '/my-reports'}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid={`filter-tab-${filter.value ?? 'all'}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center bg-card/50">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            لا توجد تقارير تقدم مسجلة
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {currentStatus
              ? 'لا توجد تقارير تطابق التصفية المحددة حالياً.'
              : 'لم تقم بتسجيل أي تقرير تقدم ميداني بعد. أنشئ تقريرك الأول لبدء توثيق سير العمل.'}
          </p>
          {!currentStatus && (
            <Link
              href="/my-reports/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>إنشاء تقريرك الأول</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">تاريخ التقرير</th>
                <th className="px-4 py-3 text-start">المشروع</th>
                <th className="px-4 py-3 text-start">عنوان التقرير</th>
                <th className="px-4 py-3 text-start">نسبة الإنجاز</th>
                <th className="px-4 py-3 text-start">الحالة</th>
                <th className="px-4 py-3 text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {reports.map((report) => (
                <tr
                  key={report.id}
                  className="hover:bg-muted/40 transition-colors"
                  data-testid={`report-row-${report.id}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span>{report.reportDate}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-1.5">
                      <FolderKanban className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                      <span className="font-semibold">{report.project?.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">({report.project?.code})</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                    {report.title}
                  </td>
                  <td className="px-4 py-3 text-foreground font-mono">
                    {report.progressPercentage !== null ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                        {report.progressPercentage}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressReportStatusBadge status={report.status} />
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      {report.status === ProgressReportStatus.DRAFT && (
                        <Link
                          href={`/my-reports/${report.id}/edit`}
                          className="rounded border border-input bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                          data-testid={`edit-report-${report.id}`}
                        >
                          تعديل
                        </Link>
                      )}
                      <Link
                        href={`/my-reports/${report.id}`}
                        className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/80"
                        data-testid={`view-report-${report.id}`}
                      >
                        <span>عرض التفاصيل</span>
                        <ArrowLeft className="size-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
