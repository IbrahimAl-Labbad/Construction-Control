import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, ArrowRight, ShieldAlert } from 'lucide-react';
import { requireManager } from '@/lib/permissions';
import { getProject } from '@/lib/projects';
import {
  getProjectTeam,
  getActiveEngineersForAssignment,
  type AvailableEngineerOptionDTO,
} from '@/lib/project-team';
import { AppError } from '@/lib/errors';
import { ProjectStatusBadge } from '../../components/project-status-badge';
import { TeamMemberTable } from './components/team-member-table';
import { AssignEngineerDialog } from './components/assign-engineer-dialog';

interface ProjectTeamPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'فريق عمل المشروع',
  description: 'إدارة وتعيين مهندسي الموقع للمشروع',
};

export default async function ProjectTeamPage({ params }: ProjectTeamPageProps) {
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

  const isProjectFrozen =
    project.status === 'COMPLETED' || project.status === 'CANCELLED';

  const [teamMembers, availableEngineers] = await Promise.all([
    getProjectTeam(projectId),
    isProjectFrozen
      ? Promise.resolve<AvailableEngineerOptionDTO[]>([])
      : getActiveEngineersForAssignment(projectId),
  ]);

  return (
    <div className="space-y-6">
      {/* Header & Back Link */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-6" aria-hidden="true" />
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
            <h1 className="text-2xl font-bold text-foreground">
              فريق عمل المشروع: {project.name}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <AssignEngineerDialog
            projectId={project.id}
            availableEngineers={availableEngineers}
            isProjectFrozen={isProjectFrozen}
          />

          <Link
            href={`/projects/${project.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted transition-colors"
            data-testid="back-to-project-button"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            العودة لبيانات المشروع
          </Link>
        </div>
      </div>

      {/* Frozen Project Notice */}
      {isProjectFrozen && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
          data-testid="project-frozen-notice"
        >
          <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              المشروع بحالة &quot;{project.status === 'COMPLETED' ? 'مكتمل' : 'ملغى'}&quot;
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              تم تجميد التعديلات على فريق العمل. لا يمكن تعيين أو إلغاء تعيين مهندسين لهذا المشروع.
            </p>
          </div>
        </div>
      )}

      {/* Team Member Tables */}
      <TeamMemberTable
        projectId={project.id}
        teamMembers={teamMembers}
        isProjectFrozen={isProjectFrozen}
      />
    </div>
  );
}
