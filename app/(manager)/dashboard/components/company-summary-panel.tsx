/**
 * app/(manager)/dashboard/components/company-summary-panel.tsx
 *
 * Renders the six company-wide financial metric cards.
 *
 * BD-31: ActualSpend (المصروفات الفعلية) and ActiveExposure (إجمالي الارتباطات والمصروفات)
 *        are rendered as SEPARATE labeled cards — never conflated.
 *
 * No financial calculations here — values come pre-computed from the DTO.
 * No mutations. No interactivity. Pure Server Component.
 */

import {
  Wallet,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';

import type { CompanyFinancialSummaryDTO } from '@/lib/dashboard/types';

interface CompanySummaryPanelProps {
  summary: CompanyFinancialSummaryDTO;
}

/** Formats a SAR amount string for Arabic display with ر.س suffix */
function formatSAR(amount: string): string {
  const num = parseFloat(amount);
  return (
    new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num) + '\u00a0ر.س'
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  testId: string;
};

function MetricCard({
  label,
  value,
  icon,
  colorClass,
  bgClass,
  testId,
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {label}
          </p>
          <p
            className={`amount text-xl font-bold truncate ${colorClass}`}
            data-testid={testId}
          >
            {formatSAR(value)}
          </p>
        </div>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${bgClass} ${colorClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export function CompanySummaryPanel({ summary }: CompanySummaryPanelProps) {
  return (
    <section aria-label="الملخص المالي للشركة">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        الملخص المالي الإجمالي
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* A — Authorized Budget */}
        <MetricCard
          label="الموازنة المعتمدة"
          value={summary.totalAuthorizedBudget}
          icon={<Wallet className="size-5" aria-hidden="true" />}
          colorClass="text-primary"
          bgClass="bg-primary/10"
          testId="company-authorized-budget"
        />

        {/* B — Actual Spend (BD-31: NOT TotalActiveExposure) */}
        <MetricCard
          label="المصروفات الفعلية"
          value={summary.totalActualSpend}
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          colorClass="text-emerald-600 dark:text-emerald-400"
          bgClass="bg-emerald-500/10"
          testId="company-actual-spend"
        />

        {/* C — Total Active Exposure (BD-31: NOT ActualSpend) */}
        <MetricCard
          label="إجمالي الارتباطات والمصروفات"
          value={summary.totalActiveExposure}
          icon={<AlertCircle className="size-5" aria-hidden="true" />}
          colorClass="text-amber-600 dark:text-amber-400"
          bgClass="bg-amber-500/10"
          testId="company-active-exposure"
        />

        {/* D — Available Balance */}
        <MetricCard
          label="الرصيد المتاح"
          value={summary.totalAvailableBalance}
          icon={<TrendingDown className="size-5" aria-hidden="true" />}
          colorClass="text-blue-600 dark:text-blue-400"
          bgClass="bg-blue-500/10"
          testId="company-available-balance"
        />

        {/* E — Pending Exposure */}
        <MetricCard
          label="التعرض المعلق"
          value={summary.totalPendingExposure}
          icon={<Clock className="size-5" aria-hidden="true" />}
          colorClass="text-orange-600 dark:text-orange-400"
          bgClass="bg-orange-500/10"
          testId="company-pending-exposure"
        />

        {/* F — Projected Balance */}
        <MetricCard
          label="الرصيد المتوقع"
          value={summary.totalProjectedBalance}
          icon={<TrendingUp className="size-5" aria-hidden="true" />}
          colorClass="text-violet-600 dark:text-violet-400"
          bgClass="bg-violet-500/10"
          testId="company-projected-balance"
        />
      </div>
    </section>
  );
}
