import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProgressReportStatus } from '@prisma/client';
import { getProject } from '@/lib/projects';
import { getProjectProgressReports } from '@/lib/progress-reports';
import { ProgressReportStatusBadge } from '@/components/progress-reports';
import { AppError } from '@/lib/errors';
import { ClipboardList, Calendar, ArrowLeft, ArrowRight, User } from 'lucide-react';

interface ProjectProgressReportsPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export const metadata: Metadata = {
  title: 'تقارير التقدم الميداني للمشروع',
  description: 'استعراض تقارير التقدم الميداني الخاصة بالمشروع',
};

export default async function ProjectProgressReportsPage({
  params,
  searchParams,
}: ProjectProgressReportsPageProps) {
  const { projectId } = await params;
  const { status: statusParam } = await searchParams;
  const currentStatus = statusParam as ProgressReportStatus | undefined;

  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  const reports = await getProjectProgressReports(
    projectId,
    currentStatus ? { status: currentStatus } : undefined,
  );

  const statusFilters: Array<{ label: string; value: string | undefined }> = [
    { label: 'الكل', value: undefined },
    { label: 'قيد المراجعة', value: ProgressReportStatus.SUBMITTED },
    { label: 'معتمد', value: ProgressReportStatus.APPROVED },
    { label: 'مرفوض', value: ProgressReportStatus.REJECTED },
    { label: 'مسودة', value: ProgressReportStatus.DRAFT },
    { label: 'ملغي', value: ProgressReportStatus.CANCELLED },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3"
          data-testid="back-to-project-button"
        >
          <ArrowRight className="size-3.5" aria-hidden="true" />
          <span>العودة لصفحة المشروع ({project.name})</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-primary">{project.code}</span>
              <h1 className="text-2xl font-bold text-foreground">
                تقارير التقدم الميداني للمشروع
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة التقارير الميدانية الدورية الخاصة بمشروع &quot;{project.name}&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2" role="tablist">
        {statusFilters.map((filter) => {
          const isActive = currentStatus === filter.value;
          return (
            <Link
              key={filter.label}
              href={
                filter.value
                  ? `/projects/${project.id}/progress?status=${filter.value}`
                  : `/projects/${project.id}/progress`
              }
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

      {/* Reports Table */}
      {reports.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center bg-card/50">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            لا توجد تقارير تقدم مسجلة لهذا المشروع
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            لم يتم رفع أي تقارير تقدم ميدانية من قبل المهندسين لهذا المشروع حتى الآن.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">تاريخ التقرير</th>
                <th className="px-4 py-3 text-start">عنوان التقرير</th>
                <th className="px-4 py-3 text-start">المهندس المُعد</th>
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
                  data-testid={`project-report-row-${report.id}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span>{report.reportDate}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                    {report.title}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span>{report.createdBy?.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-mono">
                    {report.progressPercentage !== null ? (
                      <span className="inline-flex items-center font-semibold text-emerald-700 dark:text-emerald-400">
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
                    <Link
                      href={`/progress-reports/${report.id}`}
                      className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/80"
                      data-testid={`review-report-${report.id}`}
                    >
                      <span>عرض وتدقيق</span>
                      <ArrowLeft className="size-3" aria-hidden="true" />
                    </Link>
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
