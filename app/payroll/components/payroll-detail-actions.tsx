'use client';

/**
 * app/payroll/components/payroll-detail-actions.tsx
 *
 * Client Component — Action buttons and confirmation dialogs for the Payroll detail view.
 * Role + state aware. Delegates all mutations to Server Actions.
 *
 * State × Role matrix:
 * DRAFT:
 *   - Accountant (creator): Edit, Submit, Delete, Cancel
 *   - Manager: Cancel
 * SUBMITTED:
 *   - Manager: Approve, Reject, Cancel
 * REJECTED:
 *   - Accountant (creator): Reopen
 * APPROVED:
 *   - terminal (no mutation actions)
 * CANCELLED:
 *   - terminal (no mutation actions)
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
  Ban,
  AlertTriangle,
} from 'lucide-react';

import type { PayrollDetailDTO } from '@/lib/payroll/types';
import {
  approvePayrollAction,
  cancelPayrollAction,
  deletePayrollDraftAction,
  rejectPayrollAction,
  reopenPayrollAction,
  submitPayrollAction,
} from '../actions';

interface PayrollDetailActionsProps {
  payroll: PayrollDetailDTO;
  isManager: boolean;
  isAccountant: boolean;
  isOwner: boolean;
}

export function PayrollDetailActions({
  payroll,
  isManager,
  isAccountant,
  isOwner,
}: PayrollDetailActionsProps) {
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
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  // Approval modal
  const [showApproveModal, setShowApproveModal] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Role × state predicates
  const isDraft = payroll.status === 'DRAFT';
  const isSubmitted = payroll.status === 'SUBMITTED';
  const isRejected = payroll.status === 'REJECTED';
  const isApproved = payroll.status === 'APPROVED';
  const isCancelled = payroll.status === 'CANCELLED';

  const canEdit = isAccountant && isOwner && isDraft;
  const canSubmit = isAccountant && isOwner && isDraft;
  const canDelete = isAccountant && isOwner && isDraft;
  const canApprove = isManager && isSubmitted;
  const canReject = isManager && isSubmitted;
  const canReopen = isAccountant && isOwner && isRejected;
  const canCancel =
    (isDraft && ((isAccountant && isOwner) || isManager)) ||
    (isSubmitted && isManager);

  // Terminal states have no mutations
  if (isApproved || isCancelled) {
    return null;
  }

  // Handle Submit
  function handleSubmit() {
    setActionError(null);
    startTransition(async () => {
      const res = await submitPayrollAction(payroll.id);
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  // Handle Approve
  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const res = await approvePayrollAction(payroll.id);
      if (res.success) {
        setShowApproveModal(false);
        router.refresh();
      } else {
        setActionError(res.message);
        setShowApproveModal(false);
      }
    });
  }

  // Handle Reject
  function handleReject() {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 5) {
      setRejectionError('سبب الرفض يجب أن يتكون من 5 أحرف على الأقل');
      return;
    }

    setRejectionError(null);
    startTransition(async () => {
      const res = await rejectPayrollAction(payroll.id, {
        rejectionReason: rejectionReason.trim(),
      });
      if (res.success) {
        setShowRejectModal(false);
        setRejectionReason('');
        router.refresh();
      } else {
        setRejectionError(res.message);
      }
    });
  }

  // Handle Cancel
  function handleCancel() {
    if (!cancellationReason.trim() || cancellationReason.trim().length < 5) {
      setCancellationError('سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل');
      return;
    }

    setCancellationError(null);
    startTransition(async () => {
      const res = await cancelPayrollAction(payroll.id, {
        cancellationReason: cancellationReason.trim(),
      });
      if (res.success) {
        setShowCancelModal(false);
        setCancellationReason('');
        router.refresh();
      } else {
        setCancellationError(res.message);
      }
    });
  }

  // Handle Reopen
  function handleReopen() {
    setActionError(null);
    startTransition(async () => {
      const res = await reopenPayrollAction(payroll.id);
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  // Handle Delete
  function handleDelete() {
    setActionError(null);
    startTransition(async () => {
      const res = await deletePayrollDraftAction(payroll.id);
      if (res.success) {
        setShowDeleteModal(false);
        router.push('/payroll');
      } else {
        setActionError(res.message);
        setShowDeleteModal(false);
      }
    });
  }

  return (
    <div className="space-y-4" data-testid="payroll-detail-actions">
      {actionError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Edit */}
        {canEdit && (
          <Link
            href={`/payroll/${payroll.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted transition-colors"
            data-testid="edit-payroll-button"
          >
            <Pencil className="size-4" aria-hidden="true" />
            <span>تعديل المسودة</span>
          </Link>
        )}

        {/* Submit */}
        {canSubmit && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            data-testid="submit-payroll-button"
          >
            <Send className="size-4" aria-hidden="true" />
            <span>{isPending ? 'جاري التقديم...' : 'تقديم للاعتماد'}</span>
          </button>
        )}

        {/* Approve */}
        {canApprove && (
          <button
            type="button"
            onClick={() => setShowApproveModal(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            data-testid="approve-payroll-button"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <span>اعتماد قيد الراتب</span>
          </button>
        )}

        {/* Reject */}
        {canReject && (
          <button
            type="button"
            onClick={() => setShowRejectModal(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive shadow-sm hover:bg-destructive/20 disabled:opacity-50 transition-colors"
            data-testid="reject-payroll-button"
          >
            <XCircle className="size-4" aria-hidden="true" />
            <span>رفض القيد</span>
          </button>
        )}

        {/* Reopen */}
        {canReopen && (
          <button
            type="button"
            onClick={handleReopen}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400 shadow-sm hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
            data-testid="reopen-payroll-button"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span>{isPending ? 'جاري إعادة الفتح...' : 'إعادة فتح للتعديل'}</span>
          </button>
        )}

        {/* Cancel */}
        {canCancel && (
          <button
            type="button"
            onClick={() => setShowCancelModal(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-700 dark:text-rose-400 shadow-sm hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
            data-testid="cancel-payroll-button"
          >
            <Ban className="size-4" aria-hidden="true" />
            <span>إلغاء القيد</span>
          </button>
        )}

        {/* Delete */}
        {canDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="delete-payroll-button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span>حذف المسودة</span>
          </button>
        )}
      </div>

      {/* Approve Confirmation Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" />
              <h3 className="text-lg font-bold text-foreground">تأكيد اعتماد قيد الراتب</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من اعتماد قيد الراتب للعامل{' '}
              <strong className="text-foreground">{payroll.workerName}</strong> بمبلغ{' '}
              <strong className="text-foreground">{payroll.amount} {payroll.currency}</strong>؟
              سيتم قيد المبلغ نهائياً في سجل الأجور الفعلي بعد التحقق من سقف بند الموازنة.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                disabled={isPending}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                data-testid="confirm-approve-button"
              >
                {isPending ? 'جاري الاعتماد...' : 'تأكيد الاعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="size-6 shrink-0" aria-hidden="true" />
              <h3 className="text-lg font-bold text-foreground">رفض قيد الراتب</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              يجب تقديم سبب واضح ومفصل للرفض لتوجيه المحاسب لإجراء التصحيحات اللازمة.
            </p>
            {rejectionError && (
              <p className="text-xs text-destructive">{rejectionError}</p>
            )}
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="اكتب سبب الرفض هنا (5 أحرف على الأقل)..."
              rows={3}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="rejection-reason-input"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setRejectionError(null);
                }}
                disabled={isPending}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50"
                data-testid="confirm-reject-button"
              >
                {isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reason Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Ban className="size-6 shrink-0" aria-hidden="true" />
              <h3 className="text-lg font-bold text-foreground">إلغاء قيد الراتب</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              سيتم إلغاء القيد نهائياً ولا يمكن إعادة تنشيطه لاحقاً. يرجى توضيح سبب الإلغاء.
            </p>
            {cancellationError && (
              <p className="text-xs text-destructive">{cancellationError}</p>
            )}
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء هنا (5 أحرف على الأقل)..."
              rows={3}
              className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="cancellation-reason-input"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellationReason('');
                  setCancellationError(null);
                }}
                disabled={isPending}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                data-testid="confirm-cancel-button"
              >
                {isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <Trash2 className="size-6 shrink-0" aria-hidden="true" />
              <h3 className="text-lg font-bold text-foreground">حذف مسودة القيد</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من حذف مسودة قيد الراتب هذه؟ سيتم استبعادها من القوائم التشغيلية النشطة مع حفظ أثر تدقيقي للعملية.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isPending}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50"
                data-testid="confirm-delete-button"
              >
                {isPending ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
