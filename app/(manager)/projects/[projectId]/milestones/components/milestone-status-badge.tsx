import type { MilestoneStatus } from '@/lib/milestones';

interface MilestoneStatusBadgeProps {
  status: MilestoneStatus;
  isOverdue?: boolean;
}

export function MilestoneStatusBadge({ status, isOverdue = false }: MilestoneStatusBadgeProps) {
  let badgeStyle = '';
  let label = '';

  switch (status) {
    case 'PLANNED':
      badgeStyle =
        'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300';
      label = 'قيد التخطيط';
      break;
    case 'IN_PROGRESS':
      badgeStyle =
        'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400';
      label = 'قيد التنفيذ';
      break;
    case 'COMPLETED':
      badgeStyle =
        'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
      label = 'مكتملة';
      break;
    case 'CANCELLED':
      badgeStyle =
        'border-destructive/30 bg-destructive/15 text-destructive';
      label = 'ملغاة';
      break;
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
        data-testid="milestone-status-badge"
      >
        {label}
      </span>
      {isOverdue && (
        <span
          className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 animate-pulse"
          data-testid="milestone-overdue-badge"
        >
          متأخرة
        </span>
      )}
    </div>
  );
}
