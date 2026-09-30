/**
 * app/(manager)/approvals/components/domain-badge.tsx
 *
 * Domain indicator badge for the Centralized Manager Approvals Hub.
 * Maps ApprovalDomain to Arabic label and distinct color styling.
 */

import type { ApprovalDomain } from '@/lib/approvals';

interface DomainBadgeProps {
  domain: ApprovalDomain;
  className?: string;
}

const DOMAIN_CONFIG: Record<
  ApprovalDomain,
  { label: string; className: string }
> = {
  EXPENSE: {
    label: 'مصروف',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  COMMITMENT: {
    label: 'ارتباط',
    className: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  },
  CUSTODY: {
    label: 'عهدة',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  PAYROLL: {
    label: 'أجر عمالة',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  SUBCONTRACTOR_BILLING: {
    label: 'مستخلص',
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
};

export function DomainBadge({ domain, className = '' }: DomainBadgeProps) {
  const config = DOMAIN_CONFIG[domain];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
      data-testid={`domain-badge-${domain.toLowerCase()}`}
    >
      {config.label}
    </span>
  );
}
