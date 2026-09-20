import type { CustodyStatus } from '@/lib/custodies';

export interface CustodyStatusBadgeProps {
  status: CustodyStatus;
  className?: string;
}

const CUSTODY_STATUS_CONFIG: Record<
  CustodyStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'مسودة',
    className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  },
  SUBMITTED: {
    label: 'قيد الاعتماد',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  },
  APPROVED: {
    label: 'معتمد (بانتظار الصرف)',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  REJECTED: {
    label: 'مرفوض',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  CANCELLED: {
    label: 'ملغي',
    className: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
  },
  ISSUED: {
    label: 'منصرف بالميدان',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  PARTIALLY_SETTLED: {
    label: 'مسوى جزئياً',
    className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  },
  SETTLED: {
    label: 'مسوى بالكامل',
    className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  },
  CLOSED: {
    label: 'مغلق ومؤرشف',
    className: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border-zinc-500/30',
  },
};

export function CustodyStatusBadge({
  status,
  className = '',
}: CustodyStatusBadgeProps) {
  const config = CUSTODY_STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
      data-testid="custody-status-badge"
      data-status={status}
    >
      {config.label}
    </span>
  );
}
