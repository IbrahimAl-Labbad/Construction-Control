import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { getAllProgressReports } from '@/lib/progress-reports';
import { ProgressReportStatusBadge, ProjectFilterSelect } from '@/components/progress-reports';
import { ClipboardList, Calendar, FolderKanban, ArrowLeft, User } from 'lucide-react';

export const metadata: Metadata = {
  title: 'متابعة تقارير التقدم الميداني',
  description: 'المتابعة المركزية والاعتماد لتقارير التقدم الميداني المرفوعة من مهندسي المواقع',
};

interface ManagerProgressReportsPageProps {
  searchParams: Promise<{ projectId?: string; status?: string }>;
}

export default async function ManagerProgressReportsPage({
  searchParams,
}: ManagerProgressReportsPageProps) {
  // Page-level manager authorization guard
  await requireManager();

  const params = await searchParams;
  const currentProjectId = params.projectId || undefined;
  const currentStatus = params.status as ProgressReportStatus | undefined;

  // 1. Fetch all non-deleted projects for the project filter dropdown
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  // 2. Fetch reports with filters
  const reports = await getAllProgressReports({
    projectId: currentProjectId,
    status: currentStatus,
  });

  const statusFilters: Array<{ label: string; value: string | undefined }> = [
    { label: 'الكل', value: undefined },
    { label: 'قيد المراجعة', value: ProgressReportStatus.SUBMITTED },
    { label: 'معتمد', value: ProgressReportStatus.APPROVED },
    { label: 'مرفوض', value: ProgressReportStatus.REJECTED },
    { label: 'مسودة', value: ProgressReportStatus.DRAFT },
    { label: 'ملغي', value: ProgressReportStatus.CANCELLED },
  ];

  function buildUrl(newProjectId?: string, newStatus?: string) {
    const q = new URLSearchParams();
    if (newProjectId) q.set('projectId', newProjectId);
    if (newStatus) q.set('status', newStatus);
    const qs = q.toString();
    return qs ? `/progress-reports?${qs}` : '/progress-reports';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">
              تقارير التقدم الميداني
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة واعتماد تقارير سير العمل الميدانية الواردة من مهندسي المواقع
            </p>
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          {statusFilters.map((filter) => {
            const isActive = currentStatus === filter.value;
            return (
              <Link
                key={filter.label}
                href={buildUrl(currentProjectId, filter.value)}
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

        {/* Project Dropdown Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="filter-project" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            تصفية بالمشروع:
          </label>
          <ProjectFilterSelect
            projects={projects}
            currentProjectId={currentProjectId}
            currentStatus={currentStatus}
          />
        </div>
      </div>

      {/* Reports Table */}
      {reports.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center bg-card/50">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            لا توجد تقارير تقدم مسجلة
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            لا توجد تقارير تقدم ميداني تطابق معايير التصفية المحددة.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">تاريخ التقرير</th>
                <th className="px-4 py-3 text-start">المشروع</th>
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
                  data-testid={`manager-report-row-${report.id}`}
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
                      className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                        report.status === ProgressReportStatus.SUBMITTED
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-foreground hover:bg-muted/80'
                      }`}
                      data-testid={`review-report-${report.id}`}
                    >
                      <span>{report.status === ProgressReportStatus.SUBMITTED ? 'مراجعة واعتماد' : 'عرض التفاصيل'}</span>
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
