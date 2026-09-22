/**
 * app/subcontractor-billings/components/commitment-billing-summary.tsx
 *
 * Displays contractual billing summary for a single Commitment.
 *
 * Shows:
 * - Contract Value (Commitment.amount)
 * - Cumulative Certified (SUM of APPROVED billing.grossAmount — DISPLAY ONLY)
 * - Remaining Commitment Balance (Contract Value − Cumulative Certified — DISPLAY ONLY)
 * - Approved Billing Count
 * - Billing history (all non-deleted billings)
 *
 * FINANCIAL PRESENTATION RULE (AGENTS.md §13 + Spec §8.4):
 * - cumulativeCertified is DISPLAY ONLY.
 * - It is NOT part of BudgetLine totalActiveExposure.
 * - Billing approval does NOT: increase BudgetLine exposure,
 *   create Expense, create AP, or reduce Commitment.amount.
 * - These labels must never imply they are Total Active Exposure.
 *
 * This component is a pure presentational Server Component (no 'use client').
 * It receives safe DTOs from a Server Component parent.
 */

import { AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';

import type { CommitmentBillingSummaryDTO } from '@/lib/subcontractor-billings/types';
import { BillingStatusBadge } from './billing-status-badge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommitmentBillingSummaryProps {
  summary: CommitmentBillingSummaryDTO;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommitmentBillingSummary({ summary }: CommitmentBillingSummaryProps) {
  const remainingBalance = parseFloat(summary.remainingCommitmentBalance);
  const isBalanceExhausted = remainingBalance <= 0;

  return (
    <section
      className="rounded-xl border border-border bg-card shadow-sm"
      aria-label={`ملخص مستخلصات الالتزام: ${summary.commitmentVendorName}`}
    >
      {/* Header */}
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              ملخص المستخلصات — {summary.commitmentVendorName}
            </h2>
            {summary.commitmentReferenceNumber && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                رقم الالتزام: {summary.commitmentReferenceNumber}
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs font-mono bg-muted px-2 py-1 rounded-md text-muted-foreground">
            {summary.approvedBillingCount} مستخلص معتمد
          </span>
        </div>
      </div>

      {/* Financial summary (display-only) */}
      <div className="p-5">
        {/*
         * IMPORTANT FINANCIAL PRESENTATION NOTE:
         * These figures are CONTRACTUAL PROGRESS tracking values only.
         * They are NOT BudgetLine exposure, AP liabilities, or cash payments.
         */}
        <p className="text-xs text-muted-foreground mb-4 border border-amber-500/30 bg-amber-500/5 rounded-md px-3 py-2">
          ملاحظة: هذه الأرقام تتبع التقدم التعاقدي فقط. إجمالي المستخلصات المعتمدة لا يُعدّ
          تعرضاً فعلياً على بند الموازنة ولا يُنشئ التزام دفع.
        </p>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Contract Value */}
          <div className="rounded-lg border border-border bg-background p-4 text-center">
            <dt className="text-xs text-muted-foreground mb-1">قيمة العقد</dt>
            <dd className="text-lg font-bold font-mono text-foreground">
              {formatMoney(summary.contractValue)}
              <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
            </dd>
            <p className="text-xs text-muted-foreground mt-1">مبلغ الالتزام الإجمالي</p>
          </div>

          {/* Cumulative Certified — DISPLAY ONLY */}
          <div className="rounded-lg border border-border bg-background p-4 text-center">
            <dt className="text-xs text-muted-foreground mb-1">إجمالي المعتمد</dt>
            <dd className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {formatMoney(summary.cumulativeCertified)}
              <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
            </dd>
            <p className="text-xs text-muted-foreground mt-1">
              مجموع المستخلصات المعتمدة فقط (للعرض)
            </p>
          </div>

          {/* Remaining Commitment Balance */}
          <div
            className={`rounded-lg border p-4 text-center ${
              isBalanceExhausted
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-border bg-background'
            }`}
          >
            <dt className="text-xs text-muted-foreground mb-1">الرصيد المتبقي</dt>
            <dd
              className={`text-lg font-bold font-mono ${
                isBalanceExhausted ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {formatMoney(summary.remainingCommitmentBalance)}
              <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
            </dd>
            <p className="text-xs text-muted-foreground mt-1">قيمة العقد − إجمالي المعتمد</p>
          </div>
        </dl>

        {/* Warning: balance exhausted */}
        {isBalanceExhausted && (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              تجاوز إجمالي المستخلصات المعتمدة قيمة العقد. لن يُسمح باعتماد مستخلصات إضافية لهذا الالتزام.
            </span>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="border-t border-border">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            سجل المستخلصات ({summary.billings.length})
          </h3>
        </div>

        {summary.billings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FileText className="size-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد مستخلصات مسجلة لهذا الالتزام</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              aria-label="سجل مستخلصات الالتزام"
            >
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th
                    scope="col"
                    className="px-5 py-3 text-start text-xs font-semibold text-muted-foreground"
                  >
                    الفترة
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-start text-xs font-semibold text-muted-foreground"
                  >
                    تاريخ المطالبة
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-end text-xs font-semibold text-muted-foreground"
                  >
                    المبلغ الإجمالي
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground"
                  >
                    الحالة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.billings.map((billing) => (
                  <tr
                    key={billing.id}
                    className="hover:bg-muted/20 transition-colors"
                    data-testid={`billing-history-row-${billing.id}`}
                  >
                    <td className="px-5 py-3 text-foreground">
                      {billing.billingPeriod}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(billing.claimDate)}
                    </td>
                    <td className="px-5 py-3 text-end font-mono font-semibold text-foreground">
                      {formatMoney(billing.grossAmount)}
                      <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <BillingStatusBadge status={billing.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Approved total footer */}
              {summary.approvedBillingCount > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-emerald-500/5">
                    <td
                      colSpan={2}
                      className="px-5 py-3 text-xs font-semibold text-muted-foreground"
                    >
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        إجمالي المستخلصات المعتمدة (للعرض فقط)
                      </span>
                    </td>
                    <td className="px-5 py-3 text-end font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatMoney(summary.cumulativeCertified)}
                      <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
