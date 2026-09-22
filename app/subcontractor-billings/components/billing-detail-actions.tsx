'use client';

/**
 * app/subcontractor-billings/components/billing-detail-actions.tsx
 *
 * Client Component — Action buttons for the Billing detail page.
 * Role + state aware. Delegates all mutations to Server Actions.
 *
 * State × Role matrix:
 * DRAFT:
 *   - Accountant (creator): Edit, Submit, Delete
 *   - Manager: Cancel
 *   - others: view only
 * SUBMITTED:
 *   - Manager: Approve, Reject, Cancel
 *   - others: view only
 * REJECTED:
 *   - Accountant (creator): Reopen
 *   - others: view only
 * APPROVED:
 *   - view only (terminal)
 * CANCELLED:
 *   - view only (terminal)
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

import type { SubcontractorBillingSummaryDTO } from '@/lib/subcontractor-billings/types';
import {
  submitBillingAction,
  deleteBillingDraftAction,
  approveBillingAction,
  rejectBillingAction,
  reopenBillingAction,
  cancelBillingAction,
} from '../actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BillingDetailActionsProps {
  billing: SubcontractorBillingSummaryDTO;
  isManager: boolean;
  isAccountant: boolean;
  isOwner: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingDetailActions({
  billing,
  isManager,
  isAccountant,
  isOwner,
}: BillingDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [actionError, setActionError] = useState<string | null>(null);

  // Rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Cancellation modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // ---------------------------------------------------------------------------
  // Role × state predicates
  // ---------------------------------------------------------------------------

  const isDraft = billing.status === 'DRAFT';
  const isSubmitted = billing.status === 'SUBMITTED';
  const isRejected = billing.status === 'REJECTED';
  const isApproved = billing.status === 'APPROVED';
  const isCancelled = billing.status === 'CANCELLED';

  const canEdit = isAccountant && isOwner && isDraft;
  const canSubmit = isAccountant && isOwner && isDraft;
  const canDelete = isAccountant && isOwner && isDraft;
  const canApprove = isManager && isSubmitted;
  const canReject = isManager && isSubmitted;
  const canReopen = isAccountant && isOwner && isRejected;
  const canCancel = isManager && (isDraft || isSubmitted);

  // No actions on terminal states (APPROVED, CANCELLED)
  const isTerminal = isApproved || isCancelled;
  const hasAnyAction = canEdit || canSubmit || canDelete || canApprove || canReject || canReopen || canCancel;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function runAction(action: () => Promise<{ success: boolean; message?: string }>) {
    setActionError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setActionError(result.message ?? 'حدث خطأ أثناء تنفيذ العملية');
      } else {
        router.refresh();
      }
    });
  }

  function handleSubmit() {
    runAction(() => submitBillingAction(billing.id));
  }

  function handleDelete() {
    if (!confirm('هل أنت متأكد من حذف هذه المسودة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    startTransition(async () => {
      const result = await deleteBillingDraftAction(billing.id);
      if (!result.success) {
        setActionError(result.message ?? 'فشل حذف المسودة');
      } else {
        router.push('/subcontractor-billings');
      }
    });
  }

  function handleApprove() {
    runAction(() => approveBillingAction(billing.id));
  }

  function handleReopen() {
    runAction(() => reopenBillingAction(billing.id));
  }

  async function handleRejectSubmit() {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setRejectionError('سبب الرفض يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }
    setRejectionError(null);
    startTransition(async () => {
      const result = await rejectBillingAction(billing.id, {
        rejectionReason: rejectionReason.trim(),
      });
      if (!result.success) {
        setRejectionError(result.message);
      } else {
        setShowRejectModal(false);
        setRejectionReason('');
        router.refresh();
      }
    });
  }

  async function handleCancelSubmit() {
    startTransition(async () => {
      const result = await cancelBillingAction(
        billing.id,
        cancellationReason.trim() ? { cancellationReason: cancellationReason.trim() } : undefined,
      );
      if (!result.success) {
        setActionError(result.message);
        setShowCancelModal(false);
      } else {
        setShowCancelModal(false);
        setCancellationReason('');
        router.refresh();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isTerminal) {
    return (
      <p className="text-xs text-muted-foreground italic mt-1">
        {isApproved ? 'المستخلص معتمد — للعرض فقط (لا يمكن تعديله أو إلغاؤه).' : 'المستخلص ملغى — للعرض فقط.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 items-end">
      {/* Error */}
      {actionError && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive max-w-xs"
          role="alert"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{actionError}</span>
          <button
            type="button"
            className="ms-auto hover:underline"
            onClick={() => setActionError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Action buttons */}
      {hasAnyAction && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Edit */}
          {canEdit && (
            <Link
              href={`/subcontractor-billings/${billing.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              data-testid="detail-edit-button"
            >
              <Pencil className="size-4" />
              <span>تعديل</span>
            </Link>
          )}

          {/* Submit */}
          {canSubmit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              data-testid="detail-submit-button"
            >
              <Send className="size-4" />
              <span>{isPending ? 'جاري الرفع...' : 'رفع للاعتماد'}</span>
            </button>
          )}

          {/* Delete */}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              data-testid="detail-delete-button"
            >
              <Trash2 className="size-4" />
              <span>حذف المسودة</span>
            </button>
          )}

          {/* Approve */}
          {canApprove && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              data-testid="detail-approve-button"
            >
              <CheckCircle2 className="size-4" />
              <span>{isPending ? 'جاري الاعتماد...' : 'اعتماد المستخلص'}</span>
            </button>
          )}

          {/* Reject */}
          {canReject && (
            <button
              type="button"
              onClick={() => { setShowRejectModal(true); setRejectionReason(''); setRejectionError(null); }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              data-testid="detail-reject-button"
            >
              <XCircle className="size-4" />
              <span>رفض</span>
            </button>
          )}

          {/* Reopen */}
          {canReopen && (
            <button
              type="button"
              onClick={handleReopen}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              data-testid="detail-reopen-button"
            >
              <RotateCcw className="size-4" />
              <span>{isPending ? 'جاري إعادة الفتح...' : 'إعادة فتح للتعديل'}</span>
            </button>
          )}

          {/* Cancel */}
          {canCancel && (
            <button
              type="button"
              onClick={() => { setShowCancelModal(true); setCancellationReason(''); }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition-colors"
              data-testid="detail-cancel-button"
            >
              <XCircle className="size-4" />
              <span>إلغاء</span>
            </button>
          )}
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-reject-dialog-title"
          data-testid="detail-reject-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="detail-reject-dialog-title" className="text-lg font-bold text-foreground mb-4">
              رفض المستخلص مع سبب
            </h2>
            {rejectionError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {rejectionError}
              </div>
            )}
            <label htmlFor="detail-rejection-reason" className="block text-sm font-semibold text-foreground mb-1.5">
              سبب الرفض <span className="text-destructive">*</span>
            </label>
            <textarea
              id="detail-rejection-reason"
              rows={4}
              placeholder="يرجى توضيح سبب الرفض..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              data-testid="detail-rejection-reason-input"
              aria-required="true"
            />
            <p className="mt-1 text-xs text-muted-foreground">{rejectionReason.length} / 500</p>
            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setShowRejectModal(false); setRejectionReason(''); setRejectionError(null); }}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="detail-rejection-cancel"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRejectSubmit}
                disabled={isPending}
                className="rounded-md bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                data-testid="detail-rejection-confirm"
              >
                {isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-cancel-dialog-title"
          data-testid="detail-cancel-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="detail-cancel-dialog-title" className="text-lg font-bold text-foreground mb-4">
              إلغاء المستخلص
            </h2>
            <label htmlFor="detail-cancel-reason" className="block text-sm font-semibold text-foreground mb-1.5">
              سبب الإلغاء
              <span className="ms-1 text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            <textarea
              id="detail-cancel-reason"
              rows={3}
              placeholder="يمكن ذكر سبب الإلغاء هنا (اختياري)..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              data-testid="detail-cancel-reason-input"
            />
            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setShowCancelModal(false); setCancellationReason(''); }}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="detail-cancel-dismiss"
              >
                رجوع
              </button>
              <button
                type="button"
                onClick={handleCancelSubmit}
                disabled={isPending}
                className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                data-testid="detail-cancel-confirm"
              >
                {isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
