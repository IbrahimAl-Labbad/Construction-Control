/**
 * app/(manager)/projects/[projectId]/milestones/page.tsx
 *
 * Project Milestones Management & Oversight Page — Async Server Component.
 *
 * Route: /projects/[projectId]/milestones (BD-12-17)
 *
 * Authorization (BD-12-01 .. BD-12-04):
 * - MANAGER: Full CRUD & lifecycle management across all projects.
 * - ENGINEER: Read-only access to assigned projects only (active assignment).
 * - ACCOUNTANT: Read-only access across all active projects.
 * - PURCHASING: Read-only access across all active projects.
 *
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role, ProjectStatus } from '@prisma/client';
import { Flag, ArrowRight, ShieldX } from 'lucide-react';

import { requireAuth, canViewProjectMilestones } from '@/lib/permissions';
import { prisma } from '@/lib/db/prisma';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import {
  getProjectMilestones,
  getProjectMilestoneSummary,
} from '@/lib/milestones';
import { ProjectStatusBadge } from '../../components/project-status-badge';
import { CreateMilestoneDialog } from './components/create-milestone-dialog';
import { MilestoneSummaryCard } from './components/milestone-summary-card';
import { MilestoneTable } from './components/milestone-table';

interface MilestonesPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'المعالم التعاقدية والتخطيطية للمشروع',
  description: 'متابعة المعالم التعاقدية والمخطط الزمني للمشروع',
};

export default async function ProjectMilestonesPage({
  params,
}: MilestonesPageProps) {
  const { projectId } = await params;
  const user = await requireAuth();

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!project) {
    notFound();
  }

  // Check object-level visibility authorization (BD-12-01 .. BD-12-04)
  const isAssigned =
    user.role === Role.ENGINEER
      ? await isEngineerAssignedToProject(projectId, user.id)
      : false;
  const canView = canViewProjectMilestones(user, isAssigned);
  if (!canView) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-200">
          <ShieldX className="size-7" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-foreground">غير مصرح بالدخول</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          ليس لديك الصلاحيات اللازمة للوصول إلى معالم هذا المشروع أو أنك غير مسند
          إليه كمهندس موقع نشط.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          العودة
        </Link>
      </div>
    );
  }

  const canManage = user.role === Role.MANAGER;
  const isProjectFrozen =
    project.status !== ProjectStatus.PLANNED &&
    project.status !== ProjectStatus.ACTIVE;

  const [milestones, summary] = await Promise.all([
    getProjectMilestones(projectId),
    getProjectMilestoneSummary(projectId),
  ]);

  const projectStartDateStr = project.startDate
    ? project.startDate.toISOString().slice(0, 10)
    : null;
  const projectEndDateStr = project.endDate
    ? project.endDate.toISOString().slice(0, 10)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Flag className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="font-mono text-sm font-semibold text-primary"
                data-testid="project-code"
              >
                {project.code}
              </span>
              <ProjectStatusBadge status={project.status} />
            </div>
            <h1
              className="text-2xl font-bold text-foreground"
              data-testid="project-name"
            >
              المعالم التعاقدية والتخطيطية: {project.name}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Create Dialog (Managers only on non-frozen projects) */}
          {canManage && (
            <CreateMilestoneDialog
              projectId={project.id}
              disabled={isProjectFrozen}
            />
          )}

          {/* Back to Project Details (Managers only have access to project overview) */}
          {canManage && (
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted"
              data-testid="back-to-project-button"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              <span>العودة لبيانات المشروع</span>
            </Link>
          )}
        </div>
      </div>

      {/* Summary KPI Card */}
      <MilestoneSummaryCard summary={summary} />

      {/* Milestone Data Table */}
      <MilestoneTable
        projectId={project.id}
        milestones={milestones}
        canManage={canManage}
        isProjectFrozen={isProjectFrozen}
        projectStartDate={projectStartDateStr}
        projectEndDate={projectEndDateStr}
      />
    </div>
  );
}
