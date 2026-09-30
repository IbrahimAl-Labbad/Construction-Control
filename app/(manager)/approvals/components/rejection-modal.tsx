'use client';

/**
 * app/(manager)/approvals/components/rejection-modal.tsx
 *
 * Client modal dialog for entering a rejection reason for pending approval items.
 * Enforces:
 * - Minimum 3 characters, maximum 500 characters
 * - Confirm button disabled when reason.trim().length < 3 or during submission
 * - Warning on non-reversible nature of action
 * - RTL text alignment and logical styling
 */

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  title?: string;
  itemDescription?: string;
}

export function RejectionModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'رفض المعاملة',
  itemDescription,
}: RejectionModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmed = reason.trim();
  const isValid = trimmed.length >= 3 && reason.length <= 500;

  async function handleConfirm() {
    if (!isValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onConfirm(trimmed);
      setReason('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء رفض المعاملة';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (isSubmitting) return;
    setReason('');
    setErrorMessage(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rejection-modal-title"
      data-testid="rejection-modal"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
            <h2 id="rejection-modal-title" className="text-lg font-bold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="إغلاق النافذة"
          >
            <X className="size-5" />
          </button>
        </div>

        {itemDescription && (
          <p className="text-xs text-muted-foreground mb-3">
            المعاملة: <span className="font-medium text-foreground">{itemDescription}</span>
          </p>
        )}

        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 mb-4 text-xs text-amber-700 dark:text-amber-400">
          تنبيه: هذا الإجراء نهائي ولا يمكن التراجع عنه بعد الاعتماد أو الرفض.
        </div>

        {errorMessage && (
          <div
            className="mb-3 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive"
            data-testid="rejection-error-msg"
          >
            {errorMessage}
          </div>
        )}

        <label
          htmlFor="hub-rejection-reason"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          سبب الرفض <span className="text-destructive">*</span>
          <span className="text-xs text-muted-foreground font-normal me-2">
            (3 أحرف على الأقل)
          </span>
        </label>
        <textarea
          id="hub-rejection-reason"
          rows={4}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="اكتب سبب الرفض بالتفصيل ليتم إبلاغ مقدم الطلب به..."
          className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive resize-none"
          dir="rtl"
          data-testid="rejection-reason-input"
          disabled={isSubmitting}
          aria-required="true"
        />

        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
          <span>{trimmed.length < 3 ? 'متبقي ' + (3 - trimmed.length) + ' أحرف للحد الأدنى' : 'مستوفٍ للشروط'}</span>
          <span>{reason.length} / 500</span>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
            data-testid="rejection-cancel-btn"
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
            data-testid="rejection-confirm-btn"
          >
            {isSubmitting ? 'جاري الرفض...' : 'تأكيد الرفض'}
          </Button>
        </div>
      </div>
    </div>
  );
}
