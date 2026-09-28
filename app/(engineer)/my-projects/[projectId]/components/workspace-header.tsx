import Link from 'next/link';
import {
  Calendar,
  ChevronLeft,
  MapPin,
  Plus,
  UserCheck,
} from 'lucide-react';
import type { EngineerProjectDetailDTO } from '@/lib/engineer-workspace';
import { ProjectStatusBadge } from '@/app/(manager)/projects/components/project-status-badge';

interface WorkspaceHeaderProps {
  project: EngineerProjectDetailDTO;
}

export function WorkspaceHeader({ project }: WorkspaceHeaderProps) {
  const formattedAssignedAt = new Date(project.assignedAt).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedStartDate = project.startDate
    ? new Date(project.startDate).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'غير محدد';

  const formattedEndDate = project.endDate
    ? new Date(project.endDate).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'غير محدد';

  return (
    <div className="space-y-4 border-b border-border pb-6" data-testid="engineer-workspace-header">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="مسار التنقل">
        <Link href="/my-projects" className="hover:text-foreground transition-colors">
          مشاريعي
        </Link>
        <ChevronLeft className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
        <span className="font-medium text-foreground">{project.name}</span>
      </nav>

      {/* Main Title & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
              {project.code}
            </span>
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>

          {project.description && (
            <p className="mt-2 text-xs text-muted-foreground max-w-3xl leading-relaxed">
              {project.description}
            </p>
          )}

          {/* Metadata Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-full">
              <UserCheck className="size-3.5 text-primary" aria-hidden="true" />
              <span>{project.assignedRole}</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                (منذ {formattedAssignedAt})
              </span>
            </div>

            {project.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                <span>{project.location}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
              <span>الفترة: {formattedStartDate} — {formattedEndDate}</span>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/my-reports/new?projectId=${project.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            data-testid="create-report-link"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>إنشاء تقرير ميداني</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
