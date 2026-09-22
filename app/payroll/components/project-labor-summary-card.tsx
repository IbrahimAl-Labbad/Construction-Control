import { Users, DollarSign, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import type { ProjectLaborSummaryDTO } from '@/lib/payroll/types';

interface ProjectLaborSummaryCardProps {
  summary: ProjectLaborSummaryDTO;
  title?: string;
  className?: string;
}

function formatMoney(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function ProjectLaborSummaryCard({
  summary,
  title = 'ملخص موازنة أجور العمالة للمشروع',
  className = '',
}: ProjectLaborSummaryCardProps) {
  const currency = summary.currency ?? 'SAR';

  return (
    <div
      className={`rounded-xl border border-border bg-card p-6 shadow-sm ${className}`}
      data-testid="project-labor-summary-card"
    >
      <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            {summary.projectName && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary.projectName} ({summary.projectCode})
              </p>
            )}
          </div>
        </div>
        {summary.laborBudgetLinesCount !== undefined && summary.laborBudgetLinesCount > 0 && (
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
            {summary.laborBudgetLinesCount} بنود عمالة معتمدة
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Labor Budget */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <DollarSign className="size-3.5 text-primary" aria-hidden="true" />
            <span>إجمالي موازنة الأجور المعتمدة</span>
          </div>
          <p
            className="text-lg font-bold text-foreground"
            data-testid="labor-total-budget"
          >
            {formatMoney(summary.totalLaborBudget)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{currency}</span>
          </p>
        </div>

        {/* Approved Labor Spend */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5">
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
            <CheckCircle className="size-3.5" aria-hidden="true" />
            <span>إجمالي الأجور المعتمدة (المنفذة)</span>
          </div>
          <p
            className="text-lg font-bold text-emerald-700 dark:text-emerald-400"
            data-testid="labor-approved-spend"
          >
            {formatMoney(summary.approvedLaborSpend)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{currency}</span>
          </p>
        </div>

        {/* Pending Labor Spend */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5">
          <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
            <Clock className="size-3.5" aria-hidden="true" />
            <span>أجور قيد الاعتماد (معلقة)</span>
          </div>
          <p
            className="text-lg font-bold text-blue-700 dark:text-blue-400"
            data-testid="labor-pending-spend"
          >
            {formatMoney(summary.pendingLaborSpend)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{currency}</span>
          </p>
        </div>

        {/* Remaining Labor Budget */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertCircle className="size-3.5 text-primary" aria-hidden="true" />
            <span>الرصيد المتاح للعمالة</span>
          </div>
          <p
            className="text-lg font-bold text-foreground"
            data-testid="labor-remaining-budget"
          >
            {formatMoney(summary.remainingLaborBudget)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{currency}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
