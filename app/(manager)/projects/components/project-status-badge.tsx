import type { ProjectStatus } from '@/lib/projects';

export interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  PLANNED: {
    label: 'قيد التخطيط',
    className: 'bg-muted text-muted-foreground border-border',
  },
  ACTIVE: {
    label: 'نشط',
    className:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  ON_HOLD: {
    label: 'معلق',
    className:
      'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  COMPLETED: {
    label: 'مكتمل',
    className:
      'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  },
  CANCELLED: {
    label: 'ملغى',
    className:
      'bg-destructive/15 text-destructive border-destructive/30',
  },
};

export function ProjectStatusBadge({
  status,
  className = '',
}: ProjectStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
      data-testid="project-status-badge"
      data-status={status}
    >
      {config.label}
    </span>
  );
}
