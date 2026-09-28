import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  FileText,
  MapPin,
  Receipt,
  UserCheck,
  Wallet,
  ArrowLeft,
} from 'lucide-react';
import type { EngineerProjectCardDTO } from '@/lib/engineer-workspace';
import { ProjectStatusBadge } from '@/app/(manager)/projects/components/project-status-badge';

interface ProjectCardProps {
  project: EngineerProjectCardDTO;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const milestoneProgress =
    project.milestonesCount > 0
      ? Math.round((project.completedMilestonesCount / project.milestonesCount) * 100)
      : 0;

  const formattedAssignedAt = new Date(project.assignedAt).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
      data-testid={`project-card-${project.id}`}
    >
      <div>
        {/* Top Badges & Code */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              {project.code}
            </span>
            <ProjectStatusBadge status={project.status} />
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            <UserCheck className="size-3 text-primary" aria-hidden="true" />
            <span>{project.assignedRole}</span>
          </div>
        </div>

        {/* Project Name & Location */}
        <div className="mt-3">
          <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
            {project.name}
          </h2>
          {project.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-muted-foreground/70 shrink-0" aria-hidden="true" />
              <span>{project.location}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/50">الموقع غير محدد</p>
          )}
        </div>

        {/* Milestones Progress */}
        <div className="mt-4 rounded-lg bg-muted/40 p-3 border border-border/40">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              محطات المشروع
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {project.completedMilestonesCount} / {project.milestonesCount} ({milestoneProgress}%)
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${milestoneProgress}%` }}
            />
          </div>
        </div>

        {/* Operational Signals */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 border border-border/30">
            <Receipt className="size-4 text-amber-600 shrink-0" aria-hidden="true" />
            <div className="truncate">
              <div className="text-[11px] text-muted-foreground">مصاريف معلقة</div>
              <div className="font-semibold text-foreground">{project.pendingExpensesCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 border border-border/30">
            <Wallet className="size-4 text-blue-600 shrink-0" aria-hidden="true" />
            <div className="truncate">
              <div className="text-[11px] text-muted-foreground">عهد قيد المتابعة</div>
              <div className="font-semibold text-foreground">{project.pendingCustodiesCount}</div>
            </div>
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="mt-4 space-y-1.5 text-[11px] text-muted-foreground border-t border-border/50 pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" aria-hidden="true" />
              تاريخ التعيين:
            </span>
            <span className="font-medium text-foreground">{formattedAssignedAt}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <FileText className="size-3" aria-hidden="true" />
              آخر تقرير ميداني:
            </span>
            <span className="font-medium text-foreground">
              {project.latestReportDate ?? 'لا يوجد تقارير سابقة'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-5 pt-3 border-t border-border/50">
        <Link
          href={`/my-projects/${project.id}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 py-2.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground"
          data-testid="enter-workspace-link"
        >
          <span>دخول مساحة المشروع</span>
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
