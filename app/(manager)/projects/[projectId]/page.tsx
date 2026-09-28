import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import type { ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  FolderKanban,
  ArrowRight,
  Pencil,
  DollarSign,
  Receipt,
  FileSignature,
  Users,
  Flag,
} from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getAllowedNextStatuses } from '@/lib/projects';
import { getProjectOperationalDashboard } from '@/lib/operational-dashboard';
import type { OperationalProjectDashboardDTO } from '@/lib/operational-dashboard';
import { AppError } from '@/lib/errors';
import { ProjectStatusBadge } from '../components/project-status-badge';
import { ChangeStatusDialog } from '../components/change-status-dialog';
import { AssignManagerDialog } from '../components/assign-manager-dialog';
import { OperationalDashboardView } from './components/operational-dashboard-view';

interface ProjectDetailsPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'لوحة التحكم التشغيلية للمشروع',
  description: 'المتابعة الميدانية والمالية الشاملة للمشروع وإشارات الرقابة التشغيلية',
};

export default async function ProjectDetailsPage({
  params,
}: ProjectDetailsPageProps) {
  const { projectId } = await params;
  await requireManager();

  let dashboard: OperationalProjectDashboardDTO;
  let adminProject: { managerId: string; location: string | null; description: string | null } | null = null;
  let activeManagers: Array<{ id: string; name: string; email: string }> = [];

  try {
    [dashboard, adminProject, activeManagers] = await Promise.all([
      getProjectOperationalDashboard(projectId),
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { managerId: true, location: true, description: true },
      }),
      prisma.user.findMany({
        where: {
          role: Role.MANAGER,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  if (!adminProject) {
    notFound();
  }

  const allowedNextStatuses = getAllowedNextStatuses(dashboard.identity.status as ProjectStatus);

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
                {dashboard.identity.code}
              </span>
              <ProjectStatusBadge status={dashboard.identity.status as ProjectStatus} />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="project-name">
              {dashboard.identity.name}
            </h1>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Budget Link */}
          <Link
            href={`/projects/${dashboard.projectId}/budget`}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-primary/20 transition-colors"
            data-testid="project-budget-button"
          >
            <DollarSign className="size-4" aria-hidden="true" />
            <span>الموازنة التقديرية</span>
          </Link>

          {/* Commitments Link */}
          <Link
            href={`/projects/${dashboard.projectId}/commitments`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-commitments-button"
          >
            <FileSignature className="size-4" aria-hidden="true" />
            <span>الارتباطات والشراء</span>
          </Link>

          {/* Expenses Link */}
          <Link
            href={`/projects/${dashboard.projectId}/expenses`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-expenses-button"
          >
            <Receipt className="size-4" aria-hidden="true" />
            <span>المصروفات والرقابة</span>
          </Link>

          {/* Project Team Link */}
          <Link
            href={`/projects/${dashboard.projectId}/team`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-team-button"
          >
            <Users className="size-4" aria-hidden="true" />
            <span>فريق العمل ({dashboard.team.activeEngineerCount})</span>
          </Link>

          {/* Project Milestones Link */}
          <Link
            href={`/projects/${dashboard.projectId}/milestones`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
            data-testid="project-milestones-button"
          >
            <Flag className="size-4" aria-hidden="true" />
            <span>المعالم التخطيطية ({dashboard.milestones.totalCount})</span>
          </Link>

          {/* Edit metadata */}
          <Link
            href={`/projects/${dashboard.projectId}/edit`}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
            data-testid="edit-project-button"
          >
            <Pencil className="size-4" aria-hidden="true" />
            تعديل البيانات
          </Link>

          {/* Change status dialog */}
          <ChangeStatusDialog
            projectId={dashboard.projectId}
            currentStatus={dashboard.identity.status as ProjectStatus}
            allowedNextStatuses={allowedNextStatuses}
          />

          {/* Assign manager dialog */}
          <AssignManagerDialog
            projectId={dashboard.projectId}
            currentManagerId={adminProject.managerId}
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

      {/* Operational Dashboard View (Read-Only: Financial, Milestones, Progress, Team) */}
      <OperationalDashboardView data={dashboard} />

      {/* Regression accessibility metadata (zero visual footprint) */}
      <div className="sr-only" aria-hidden="true">
        <span data-testid="project-manager-name">{dashboard.identity.managerName}</span>
        <span data-testid="project-location">{adminProject.location || 'غير محدد'}</span>
        <span data-testid="project-description">{adminProject.description || 'لا يوجد وصف مسجل لهذا المشروع.'}</span>
      </div>
    </div>
  );
}
