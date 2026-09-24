/**
 * app/(manager)/dashboard/components/pending-approvals-panel.tsx
 *
 * Renders pending approval count cards for five entity types.
 *
 * BD-16: Counts only — no SAR amounts.
 * BD-29b navigation targets (inspected routes):
 *   Expenses, Commitments, Custodies, Payroll → /projects (per-project routes require projectId)
 *   SubcontractorBillings → /subcontractor-billings (company-wide list exists)
 *
 * When count = 0: rendered as non-actionable (no <Link> wrapper).
 * BD-36: No approval actions on dashboard.
 */

import Link from 'next/link';
import { Receipt, FileSignature, Wallet, Users, FileText } from 'lucide-react';

import type { PendingApprovalsDTO } from '@/lib/dashboard/types';

interface PendingApprovalsPanelProps {
  approvals: PendingApprovalsDTO;
}

type PendingCardConfig = {
  label: string;
  count: number;
  icon: React.ReactNode;
  href: string | null;
  testId: string;
};

function PendingCard({ label, count, icon, href, testId }: PendingCardConfig) {
  const content = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
              count > 0
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {icon}
          </div>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span
          className={`text-xl font-bold tabular-nums ${
            count > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          }`}
          data-testid={testId}
        >
          {count.toLocaleString('ar-SA')}
        </span>
      </div>
    </div>
  );

  // Only wrap in Link when count > 0 and a meaningful route exists (BD-29b)
  if (count > 0 && href) {
    return (
      <Link href={href} className="block" aria-label={`${label}: ${count} معلق`}>
        {content}
      </Link>
    );
  }

  return <div>{content}</div>;
}

export function PendingApprovalsPanel({ approvals }: PendingApprovalsPanelProps) {
  const cards: PendingCardConfig[] = [
    {
      label: 'مصروفات معلقة',
      count: approvals.expenses,
      icon: <Receipt className="size-4.5" aria-hidden="true" />,
      // Per-project route only — /projects is the meaningful entry point
      href: '/projects',
      testId: 'pending-expenses-count',
    },
    {
      label: 'ارتباطات معلقة',
      count: approvals.commitments,
      icon: <FileSignature className="size-4.5" aria-hidden="true" />,
      href: '/projects',
      testId: 'pending-commitments-count',
    },
    {
      label: 'عهد معلقة',
      count: approvals.custodies,
      icon: <Wallet className="size-4.5" aria-hidden="true" />,
      href: '/projects',
      testId: 'pending-custodies-count',
    },
    {
      label: 'رواتب معلقة',
      count: approvals.payrollEntries,
      icon: <Users className="size-4.5" aria-hidden="true" />,
      href: '/projects',
      testId: 'pending-payroll-count',
    },
    {
      label: 'مستخلصات معلقة',
      count: approvals.subcontractorBillings,
      icon: <FileText className="size-4.5" aria-hidden="true" />,
      // Company-wide list exists at /subcontractor-billings (BD-29b inspection)
      href: '/subcontractor-billings',
      testId: 'pending-billings-count',
    },
  ];

  return (
    <section aria-label="الموافقات المعلقة">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          الموافقات المعلقة
        </h2>
        {approvals.total > 0 && (
          <span
            className="text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 border border-amber-500/20"
            data-testid="pending-total-count"
          >
            {approvals.total.toLocaleString('ar-SA')} إجمالاً
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <PendingCard key={card.testId} {...card} />
        ))}
      </div>
    </section>
  );
}
