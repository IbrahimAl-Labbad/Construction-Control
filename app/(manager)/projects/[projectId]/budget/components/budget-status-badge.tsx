import type { BudgetStatus } from '@/lib/budget';

export interface BudgetStatusBadgeProps {
  status: BudgetStatus;
  className?: string;
}

const BUDGET_STATUS_CONFIG: Record<
  BudgetStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'مسودة',
    className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  },
  SUBMITTED: {
    label: 'قيد المراجعة والاعتماد',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  },
  APPROVED: {
    label: 'معتمدة رسمياً',
    className:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  REJECTED: {
    label: 'مرفوضة',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  SUPERSEDED: {
    label: 'مستبدلة',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function BudgetStatusBadge({
  status,
  className = '',
}: BudgetStatusBadgeProps) {
  const config = BUDGET_STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
      data-testid="budget-status-badge"
      data-status={status}
    >
      {config.label}
    </span>
  );
}
