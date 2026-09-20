import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  FolderKanban,
  ArrowRight,
  User,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Pencil,
  DollarSign,
  Receipt,
  FileSignature,
  Wallet,
} from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProject, getAllowedNextStatuses } from '@/lib/projects';
import { getProjectBudget } from '@/lib/budget';
import { AppError } from '@/lib/errors';
import { ProjectStatusBadge } from '../components/project-status-badge';
import { ChangeStatusDialog } from '../components/change-status-dialog';
import { AssignManagerDialog } from '../components/assign-manager-dialog';

interface ProjectDetailsPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'تفاصيل المشروع',
  description: 'عرض البيانات التشغيلية والموقع والمدير المسؤول عن المشروع',
};

function formatDate(date: Date | null): string {
  if (!date) return 'غير محدد';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export default async function ProjectDetailsPage({
  params,
}: ProjectDetailsPageProps) {
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

  // Fetch active managers for re-assignment dialog
  const activeManagers = await prisma.user.findMany({
    where: {
      role: Role.MANAGER,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  const allowedNextStatuses = getAllowedNextStatuses(project.status);
  const budget = await getProjectBudget(projectId);

  return (
    <div className="space-y-6">
      {/* Top Header with Back Link & Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-semibold text-primary" data-testid="project-code">
                {project.code}
              </span>
              <ProjectStatusBadge status={project.status} />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="project-name">
              {project.name}
            </h1>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Budget Link */}
          <Link
            href={`/projects/${project.id}/budget`}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-primary/20 transition-colors"
            data-testid="project-budget-button"
          >
            <DollarSign className="size-4" aria-hidden="true" />
            <span>الموازنة التقديرية</span>
          </Link>

          {/* Commitments Link */}
          <Link
            href={`/projects/${project.id}/commitments`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-commitments-button"
          >
            <FileSignature className="size-4" aria-hidden="true" />
            <span>الارتباطات والشراء</span>
          </Link>

          {/* Expenses Link */}
          <Link
            href={`/projects/${project.id}/expenses`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-expenses-button"
          >
            <Receipt className="size-4" aria-hidden="true" />
            <span>المصروفات والرقابة</span>
          </Link>

          {/* Edit metadata */}
          <Link
            href={`/projects/${project.id}/edit`}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
            data-testid="edit-project-button"
          >
            <Pencil className="size-4" aria-hidden="true" />
            تعديل البيانات
          </Link>

          {/* Change status dialog */}
          <ChangeStatusDialog
            projectId={project.id}
            currentStatus={project.status}
            allowedNextStatuses={allowedNextStatuses}
          />

          {/* Assign manager dialog */}
          <AssignManagerDialog
            projectId={project.id}
            currentManagerId={project.managerId}
            managers={activeManagers}
          />

          {/* Back to list */}
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted"
            data-testid="back-to-projects-button"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            العودة لقائمة المشاريع
          </Link>
        </div>
      </div>

      {/* Financial Control & Budget Banner */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <DollarSign className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-foreground">
                الرقابة المالية والموازنة التقديرية
              </span>
              {budget ? (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${
                    budget.status === 'APPROVED'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : budget.status === 'SUBMITTED'
                      ? 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400'
                      : budget.status === 'REJECTED'
                      ? 'border-destructive/30 bg-destructive/15 text-destructive'
                      : 'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300'
                  }`}
                  data-testid="project-budget-status-badge"
                >
                  {budget.status === 'APPROVED'
                    ? 'معتمدة رسمياً'
                    : budget.status === 'SUBMITTED'
                    ? 'قيد الاعتماد'
                    : budget.status === 'REJECTED'
                    ? 'مرفوضة'
                    : 'مسودة'}
                </span>
              ) : (
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold"
                  data-testid="project-no-budget-badge"
                >
                  غير محددة (مطلوبة لتفعيل المشروع)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {budget
                ? `إجمالي الموازنة: ${budget.totalAmount} ر.س (${budget.lineCount} بنود تكلفة)`
                : 'يجب اعتماد موازنة تقديرية أولاً قبل تمكين الانتقال لحالة المشروع "نشط"'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {budget?.status === 'APPROVED' && (
            <>
              <Link
                href={`/projects/${project.id}/commitments`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary/20 shrink-0"
                data-testid="view-commitments-button"
              >
                <FileSignature className="size-4" aria-hidden="true" />
                <span>أوامر الشراء والارتباطات</span>
              </Link>
              <Link
                href={`/projects/${project.id}/expenses`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted shrink-0"
                data-testid="view-expenses-button"
              >
                <Receipt className="size-4" aria-hidden="true" />
                <span>المصروفات الفعلية</span>
              </Link>
              <Link
                href={`/projects/${project.id}/custodies`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 shadow-sm hover:bg-amber-500/20 shrink-0"
                data-testid="view-custodies-button"
              >
                <Wallet className="size-4" aria-hidden="true" />
                <span>العهد النقدية والتسويات</span>
              </Link>
            </>
          )}
          <Link
            href={`/projects/${project.id}/budget`}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 shrink-0"
            data-testid="view-manage-budget-button"
          >
            <DollarSign className="size-4" aria-hidden="true" />
            <span>{budget ? 'استعراض وإدارة الموازنة' : 'إعداد مسودة الموازنة'}</span>
          </Link>
        </div>
      </div>

      {/* Metadata Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Manager */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <User className="size-4 text-primary" aria-hidden="true" />
            <span>مدير المشروع المسؤول</span>
          </div>
          <p className="mt-2 text-base font-semibold text-foreground" data-testid="project-manager-name">
            {project.manager.name}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {project.manager.email}
          </p>
        </div>

        {/* Location */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            <span>موقع المشروع</span>
          </div>
          <p className="mt-2 text-base font-semibold text-foreground" data-testid="project-location">
            {project.location || 'غير محدد'}
          </p>
        </div>

        {/* Start Date */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            <span>تاريخ البدء المخطط</span>
          </div>
          <p className="mt-2 text-base font-semibold text-foreground" data-testid="project-start-date">
            {formatDate(project.startDate)}
          </p>
        </div>

        {/* End Date */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            <span>تاريخ الانتهاء المستهدف</span>
          </div>
          <p className="mt-2 text-base font-semibold text-foreground" data-testid="project-end-date">
            {formatDate(project.endDate)}
          </p>
        </div>
      </div>

      {/* Description Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-3 mb-3">
          <FileText className="size-4 text-primary" aria-hidden="true" />
          <span>وصف ونطاق المشروع</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="project-description">
          {project.description || 'لا يوجد وصف مسجل لهذا المشروع.'}
        </p>
      </div>

      {/* Audit Info Footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Clock className="size-3.5" aria-hidden="true" />
        <span>تاريخ تسجيل المشروع في النظام: {formatDate(project.createdAt)}</span>
      </div>
    </div>
  );
}
