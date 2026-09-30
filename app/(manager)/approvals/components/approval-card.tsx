'use client';

/**
 * app/(manager)/approvals/components/approval-card.tsx
 *
 * Renders a single pending approval item as an RTL card.
 * Handles approval and rejection dispatches with in-flight lock to prevent duplicate submissions.
 *
 * Follows AGENTS.md §13, §19, §26.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DomainBadge } from './domain-badge';
import { RejectionModal } from './rejection-modal';
import type { ApprovalItemDTO } from '@/lib/approvals';

import {
  approveExpenseHubAction,
  rejectExpenseHubAction,
  approveCommitmentHubAction,
  rejectCommitmentHubAction,
  approveCustodyHubAction,
  rejectCustodyHubAction,
  approvePayrollHubAction,
  rejectPayrollHubAction,
  approveBillingHubAction,
  rejectBillingHubAction,
} from '../actions';

interface ApprovalCardProps {
  item: ApprovalItemDTO;
}

export function ApprovalCard({ item }: ApprovalCardProps) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isPending = isApproving;

  async function handleApprove() {
    if (isPending) return;
    try {
      setIsApproving(true);
      setActionError(null);

      let result;
      switch (item.domain) {
        case 'EXPENSE':
          result = await approveExpenseHubAction(item.id);
          break;
        case 'COMMITMENT':
          result = await approveCommitmentHubAction(item.id);
          break;
        case 'CUSTODY':
          result = await approveCustodyHubAction(item.id);
          break;
        case 'PAYROLL':
          result = await approvePayrollHubAction(item.id);
          break;
        case 'SUBCONTRACTOR_BILLING':
          result = await approveBillingHubAction(item.id);
          break;
      }

      if (!result.success) {
        setActionError(result.message || 'فشل اعتماد المعاملة');
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الاعتماد';
      setActionError(msg);
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject(reason: string) {
    let result;
    switch (item.domain) {
      case 'EXPENSE':
        result = await rejectExpenseHubAction(item.id, reason);
        break;
      case 'COMMITMENT':
        result = await rejectCommitmentHubAction(item.id, reason);
        break;
      case 'CUSTODY':
        result = await rejectCustodyHubAction(item.id, reason);
        break;
      case 'PAYROLL':
        result = await rejectPayrollHubAction(item.id, reason);
        break;
      case 'SUBCONTRACTOR_BILLING':
        result = await rejectBillingHubAction(item.id, reason);
        break;
    }

    if (!result.success) {
      throw new Error(result.message || 'فشل رفض المعاملة');
    }
    router.refresh();
  }

  // Format date helper for display
  function formatDisplayDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <>
      <div
        className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        data-testid={`approval-card-${item.id}`}
      >
        {/* Header: Domain Badge + Project Name & Code */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <DomainBadge domain={item.domain} />
            <span className="font-semibold text-foreground text-sm">
              {item.projectName}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
              {item.projectCode}
            </span>
          </div>
          <div className="text-start sm:text-end">
            <span className="text-lg font-bold text-foreground">
              {item.amount}
            </span>
            <span className="ms-1 text-xs text-muted-foreground font-medium">
              {item.currency}
            </span>
          </div>
        </div>

        {/* Error message banner if action failed */}
        {actionError && (
          <div
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            data-testid={`card-error-${item.id}`}
          >
            {actionError}
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-4">
          <div>
            <span className="text-muted-foreground">بند الميزانية: </span>
            <span className="font-medium text-foreground">
              {item.budgetLineCategory} — {item.budgetLineDescription}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground">مقدم الطلب: </span>
            <span className="font-medium text-foreground">{item.initiatorName}</span>
          </div>

          {/* Domain Specific Fields */}
          {item.domain === 'EXPENSE' && (
            <>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">الوصف: </span>
                <span className="text-foreground">{item.description}</span>
              </div>
              <div>
                <span className="text-muted-foreground">تاريخ المصروف: </span>
                <span className="font-medium text-foreground">{item.expenseDate}</span>
              </div>
              {item.custodyCode && (
                <div>
                  <span className="text-muted-foreground">عهدة مرتبطة: </span>
                  <span className="font-medium text-foreground">{item.custodyCode}</span>
                </div>
              )}
            </>
          )}

          {item.domain === 'COMMITMENT' && (
            <>
              <div>
                <span className="text-muted-foreground">المورد: </span>
                <span className="font-medium text-foreground">{item.vendorName}</span>
              </div>
              {item.referenceNumber && (
                <div>
                  <span className="text-muted-foreground">رقم المرجع: </span>
                  <span className="font-medium text-foreground">{item.referenceNumber}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">تاريخ الارتباط: </span>
                <span className="font-medium text-foreground">{item.commitmentDate}</span>
              </div>
              {item.submitterName && (
                <div>
                  <span className="text-muted-foreground">قُدم بواسطة: </span>
                  <span className="font-medium text-foreground">{item.submitterName}</span>
                </div>
              )}
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">الوصف: </span>
                <span className="text-foreground">{item.description}</span>
              </div>
            </>
          )}

          {item.domain === 'CUSTODY' && (
            <>
              <div>
                <span className="text-muted-foreground">كود العهدة: </span>
                <span className="font-medium text-foreground">{item.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">أمين العهدة: </span>
                <span className="font-medium text-foreground">{item.custodianName}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">الغرض: </span>
                <span className="text-foreground">{item.purpose}</span>
              </div>
              {item.expectedSettlementDate && (
                <div>
                  <span className="text-muted-foreground">تاريخ التسوية المتوقع: </span>
                  <span className="font-medium text-foreground">{item.expectedSettlementDate}</span>
                </div>
              )}
            </>
          )}

          {item.domain === 'PAYROLL' && (
            <>
              <div>
                <span className="text-muted-foreground">اسم العامل: </span>
                <span className="font-medium text-foreground">{item.workerName}</span>
              </div>
              {item.tradeOrTitle && (
                <div>
                  <span className="text-muted-foreground">المهنة: </span>
                  <span className="font-medium text-foreground">{item.tradeOrTitle}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">الفترة: </span>
                <span className="font-medium text-foreground">
                  {item.periodMonth} / {item.periodYear}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">الوصف: </span>
                <span className="text-foreground">{item.description}</span>
              </div>
            </>
          )}

          {item.domain === 'SUBCONTRACTOR_BILLING' && (
            <>
              <div>
                <span className="text-muted-foreground">المقاول من الباطن: </span>
                <span className="font-medium text-foreground">{item.subcontractorName}</span>
              </div>
              {item.referenceNumber && (
                <div>
                  <span className="text-muted-foreground">رقم المستخلص: </span>
                  <span className="font-medium text-foreground">{item.referenceNumber}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">فترة المستخلص: </span>
                <span className="font-medium text-foreground">{item.billingPeriod}</span>
              </div>
              <div>
                <span className="text-muted-foreground">تاريخ المطالبة: </span>
                <span className="font-medium text-foreground">{item.claimDate}</span>
              </div>
              {item.commitmentReference && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">الارتباط: </span>
                  <span className="font-medium text-foreground">
                    {item.commitmentReference} ({item.commitmentAmount} ر.س)
                  </span>
                </div>
              )}
            </>
          )}

          <div className="sm:col-span-2 text-muted-foreground">
            تاريخ التقديم: {formatDisplayDate(item.submittedAt ?? item.createdAt)}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
          <Link
            href={item.detailsHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            data-testid={`card-details-link-${item.id}`}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            عرض التفاصيل
          </Link>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRejectModal(true)}
              disabled={isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              data-testid={`card-reject-btn-${item.id}`}
            >
              <X className="size-3.5 ms-1" aria-hidden="true" />
              رفض
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid={`card-approve-btn-${item.id}`}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 ms-1 animate-spin" aria-hidden="true" />
                  جاري الاعتماد...
                </>
              ) : (
                <>
                  <Check className="size-3.5 ms-1" aria-hidden="true" />
                  اعتماد
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <RejectionModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleReject}
        title={`رفض ${item.projectName}`}
        itemDescription={`${item.projectName} - ${item.amount} ر.س`}
      />
    </>
  );
}
