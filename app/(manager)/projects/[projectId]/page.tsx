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
} from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProject, getAllowedNextStatuses } from '@/lib/projects';
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
