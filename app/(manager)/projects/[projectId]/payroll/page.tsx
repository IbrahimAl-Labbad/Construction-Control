import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Users, Eye } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProject } from '@/lib/projects';
import {
  getProjectLaborSummary,
  getProjectPayrollEntries,
} from '@/lib/payroll';
import { AppError } from '@/lib/errors';
import { PayrollStatusBadge } from '@/app/payroll/components/payroll-status-badge';
import { ProjectLaborSummaryCard } from '@/app/payroll/components/project-labor-summary-card';

interface ProjectPayrollPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'أجور وعمالة المشروع',
  description: 'متابعة نفقات الأجور المباشرة والرقابة على موازنة العمالة للمشروع',
};

function formatMoney(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ar-SA');
}

export default async function ProjectPayrollPage({
  params,
}: ProjectPayrollPageProps) {
  const { projectId } = await params;
  await requireManager();

  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  const [laborSummary, entries] = await Promise.all([
    getProjectLaborSummary(projectId),
    getProjectPayrollEntries(projectId),
  ]);

  return (
    <div className="space-y-6" data-testid="project-payroll-page">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/projects" className="hover:text-foreground transition-colors">
                المشاريع
              </Link>
              <span>/</span>
              <Link
                href={`/projects/${project.id}`}
                className="hover:text-foreground transition-colors font-mono"
              >
                {project.code}
              </Link>
              <span>/</span>
              <span className="text-foreground font-semibold">أجور وعمالة المشروع</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              أجور وعمالة: {project.name}
            </h1>
          </div>
        </div>

        {/* Back Link */}
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted shrink-0"
          data-testid="back-to-project-button"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          <span>العودة لبيانات المشروع</span>
        </Link>
      </div>

      {/* Labor Budget Summary Card */}
      <ProjectLaborSummaryCard
        summary={laborSummary}
        title="موقف موازنة أجور العمالة للمشروع"
      />

      {/* Entries Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">
              سجل قيود أجور العمالة المباشرة ({entries.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              كافة قيود الأجور المسجلة والمعتمدة لهذا المشروع
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="size-12 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
            <h3 className="text-base font-bold text-foreground mb-1">
              لا توجد قيود أجور مسجلة لهذا المشروع
            </h3>
            <p className="text-xs text-muted-foreground">
              يتم تسجيل القيود بواسطة المحاسب ورفعها للاعتماد الرقابي.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start" data-testid="project-payroll-table">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3.5 text-start">العامل الميداني</th>
                  <th scope="col" className="px-4 py-3.5 text-start">الفترة</th>
                  <th scope="col" className="px-4 py-3.5 text-start">المبلغ</th>
                  <th scope="col" className="px-4 py-3.5 text-start">بند الموازنة</th>
                  <th scope="col" className="px-4 py-3.5 text-start">الحالة</th>
                  <th scope="col" className="px-4 py-3.5 text-start">تاريخ القيد</th>
                  <th scope="col" className="px-4 py-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`project-payroll-row-${entry.id}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">
                        {entry.workerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.tradeOrTitle ?? entry.workerReference ?? '—'}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-foreground font-medium whitespace-nowrap">
                      {entry.periodFormattedAr}
                    </td>

                    <td className="px-4 py-3.5 font-mono font-bold text-foreground whitespace-nowrap">
                      {formatMoney(entry.amount)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {entry.currency}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-xs truncate">
                      {entry.budgetLine?.description ?? '—'}
                    </td>

                    <td className="px-4 py-3.5">
                      <PayrollStatusBadge status={entry.status} />
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>

                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <Link
                        href={`/payroll/${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
                        data-testid={`view-payroll-${entry.id}`}
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        <span>عرض</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
