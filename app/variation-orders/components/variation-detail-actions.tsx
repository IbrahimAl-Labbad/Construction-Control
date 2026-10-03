'use client';

/**
 * app/variation-orders/components/variation-detail-actions.tsx
 *
 * Action bar for Variation Order detail page.
 * Handles lifecycle state transitions:
 * - Submit draft (DRAFT -> SUBMITTED)
 * - Delete draft
 * - Approve (SUBMITTED -> APPROVED) [Manager only]
 * - Reject (SUBMITTED -> REJECTED) [Manager only, mandatory reason]
 * - Reopen (REJECTED -> DRAFT)
 *
 * Follows AGENTS.md §8, §10, §18, §26.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  Edit,
  Trash2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { VariationOrderDetailDTO } from '@/lib/variation-orders';
import {
  submitVariationOrderAction,
  approveVariationOrderAction,
  rejectVariationOrderAction,
  reopenVariationOrderAction,
  deleteVariationOrderAction,
} from '../actions';

interface VariationDetailActionsProps {
  variation: VariationOrderDetailDTO;
  currentUserId: string;
  isManager: boolean;
  isCreator: boolean;
}

export function VariationDetailActions({
  variation,
  currentUserId,
  isManager,
  isCreator,
}: VariationDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const isSelfSubmission = isManager && variation.createdById === currentUserId;

  // Actions
  function handleSubmit() {
    setActionError(null);
    startTransition(async () => {
      const res = await submitVariationOrderAction({ id: variation.id });
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const res = await approveVariationOrderAction({
        id: variation.id,
      });
      if (res.success) {
        setShowApproveModal(false);
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  function handleReject() {
    if (!rejectionReason.trim()) {
      setActionError('سبب الرفض إلزامي');
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await rejectVariationOrderAction({
        id: variation.id,
        rejectionReason,
      });
      if (res.success) {
        setShowRejectModal(false);
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  function handleReopen() {
    setActionError(null);
    startTransition(async () => {
      const res = await reopenVariationOrderAction({
        id: variation.id,
      });
      if (res.success) {
        setShowReopenModal(false);
        router.refresh();
      } else {
        setActionError(res.message);
      }
    });
  }

  function handleDelete() {
    setActionError(null);
    startTransition(async () => {
      const res = await deleteVariationOrderAction(variation.id, variation.projectId);
      if (res.success) {
        router.push('/variation-orders');
      } else {
        setActionError(res.message);
      }
    });
  }

  return (
    <div className="space-y-3" data-testid="variation-detail-actions">
      {/* Error alert */}
      {actionError && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
          data-testid="action-error-banner"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Button Row */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* DRAFT state actions */}
        {variation.status === 'DRAFT' && (isCreator || isManager) && (
          <>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="submit-for-approval-button"
            >
              <Send className="size-3.5" aria-hidden="true" />
              <span>{isPending ? 'جاري الرفع...' : 'رفع الأمر للاعتماد'}</span>
            </button>

            <Link
              href={`/variation-orders/${variation.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              data-testid="edit-variation-button"
            >
              <Edit className="size-3.5" aria-hidden="true" />
              <span>تعديل المسودة</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
              data-testid="delete-variation-button"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span>حذف</span>
            </button>
          </>
        )}

        {/* SUBMITTED state actions (Manager only) */}
        {variation.status === 'SUBMITTED' && isManager && (
          <>
            {isSelfSubmission ? (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                <Lock className="size-4 shrink-0" aria-hidden="true" />
                <span>فصل المهام: لا يمكنك اعتماد أمر قمت بإنشائه بنفسك.</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowApproveModal(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  data-testid="approve-variation-button"
                >
                  <CheckCircle className="size-3.5" aria-hidden="true" />
                  <span>اعتماد أمر التغيير</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  data-testid="reject-variation-button"
                >
                  <XCircle className="size-3.5" aria-hidden="true" />
                  <span>رفض الأمر</span>
                </button>
              </>
            )}
          </>
        )}

        {/* REJECTED state actions (Reopen) */}
        {variation.status === 'REJECTED' && (isCreator || isManager) && (
          <button
            type="button"
            onClick={() => setShowReopenModal(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            data-testid="reopen-variation-button"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>إعادة فتح المسودة والتعديل</span>
          </button>
        )}
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <CheckCircle className="size-5 text-emerald-600" aria-hidden="true" />
              <span>تأكيد اعتماد أمر التغيير</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              باعتماد هذا الأمر، سيتم تحديث موازنة المشروع المعتمدة رسمياً بقيمة الأثر المالي ({variation.impactAmount} ر.س) ولن يكون بالإمكان التعديل عليه.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                data-testid="confirm-approve-button"
              >
                {isPending ? 'جاري الاعتماد...' : 'تأكيد الاعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 text-destructive">
              <XCircle className="size-5" aria-hidden="true" />
              <span>رفض أمر التغيير</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              يجب إدخال مبرر وسبب الرفض لإعلام مقدم الطلب وتوجيهه بالتعديلات المطلوبة.
            </p>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                سبب الرفض <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="بيان سبب الرفض بالتفصيل..."
                className="w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground"
                data-testid="rejection-reason-textarea"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending || !rejectionReason.trim()}
                className="rounded-lg bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                data-testid="confirm-reject-button"
              >
                {isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <RotateCcw className="size-5 text-primary" aria-hidden="true" />
              <span>إعادة فتح أمر التغيير كمسودة</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              سيتم تحويل حالة الأمر إلى (مسودة) مما يتيح تعديل الكميات والأسعار والمبررات ثم إعادة رفعه للاعتماد مجدداً.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={isPending}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                data-testid="confirm-reopen-button"
              >
                {isPending ? 'جاري إعادة الفتح...' : 'تأكيد إعادة الفتح'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-destructive flex items-center gap-2">
              <Trash2 className="size-5" aria-hidden="true" />
              <span>تأكيد حذف مسودة أمر التغيير</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              هل أنت متأكد من حذف هذه المسودة نهائياً؟ لن يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-lg bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
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
