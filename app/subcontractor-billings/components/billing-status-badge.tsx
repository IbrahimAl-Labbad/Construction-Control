import type { SubcontractorBillingStatus } from '@/lib/subcontractor-billings/types';

export interface BillingStatusBadgeProps {
  status: SubcontractorBillingStatus;
  className?: string;
}

const BILLING_STATUS_CONFIG: Record<
  SubcontractorBillingStatus,
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
    label: 'معتمد',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  REJECTED: {
    label: 'مرفوض',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  CANCELLED: {
    label: 'ملغى',
    className: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
  },
};

export function BillingStatusBadge({ status, className = '' }: BillingStatusBadgeProps) {
  const config = BILLING_STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
      data-testid="billing-status-badge"
      data-status={status}
    >
      {config.label}
    </span>
  );
}
