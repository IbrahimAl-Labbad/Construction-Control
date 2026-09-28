import Link from 'next/link';
import { DollarSign, ArrowUpRight, TrendingUp, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import type { ProjectOperationalFinancialDTO } from '@/lib/operational-dashboard/types';

interface OperationalFinancialCardProps {
  financial: ProjectOperationalFinancialDTO;
  projectId: string;
}

export function OperationalFinancialCard({
  financial,
  projectId,
}: OperationalFinancialCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
      data-testid="operational-financial-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                الموقف المالي والرقابة على الموازنة
              </h2>
              {financial.hasApprovedBudget ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                  data-testid="budget-approved-badge"
                >
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  <span data-testid="project-budget-status-badge">معتمدة رسمياً</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                  data-testid="no-approved-budget-badge"
                >
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  <span data-testid="project-no-budget-badge">بدون موازنة معتمدة</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              مؤشرات السيولة والارتباطات المالية المحسوبة بالريال السعودي (SAR)
            </p>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/budget`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline self-start sm:self-center"
        >
          <span>تفاصيل بنود الموازنة</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {!financial.hasApprovedBudget && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>لم يتم اعتماد موازنة تقديرية لهذا المشروع بعد. كافة المؤشرات المالية صفرية حتى اعتماد الموازنة رسمياً.</span>
        </div>
      )}

      {/* 6 Canonical Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. Authorized Budget */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            الموازنة التقديرية المعتمدة
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-foreground"
              data-testid="authorized-budget-value"
            >
              {financial.authorizedBudget}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>

        {/* 2. Actual Spend */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            المصروف الفعلي (المنفذ)
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400"
              data-testid="actual-spend-value"
            >
              {financial.actualSpend}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>

        {/* 3. Total Active Exposure */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            إجمالي الالتزام النشط
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400"
              data-testid="total-active-exposure-value"
            >
              {financial.totalActiveExposure}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>

        {/* 4. Available Balance */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            الرصيد المتاح للالتزام
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400"
              data-testid="available-balance-value"
            >
              {financial.availableBalance}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>

        {/* 5. Pending Exposure */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            التزامات قيد المراجعة
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400"
              data-testid="pending-exposure-value"
            >
              {financial.pendingExposure}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>

        {/* 6. Projected Balance */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="size-3" aria-hidden="true" />
            الرصيد المتوقع بعد المعلق
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-bold font-mono text-foreground"
              data-testid="projected-balance-value"
            >
              {financial.projectedBalance}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">ر.س</span>
          </div>
        </div>
      </div>
    </div>
  );
}
