'use client';

/**
 * components/progress-reports/reject-report-dialog.tsx
 *
 * Accessible modal dialog for rejecting a submitted progress report.
 * Allows entering an optional rejection reason.
 */

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { XCircle, AlertCircle } from 'lucide-react';

interface RejectReportDialogProps {
  reportId: string;
  onReject: (reportId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
}

export function RejectReportDialog({ reportId, onReject }: RejectReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setReason('');
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onReject(reportId, reason.trim() || undefined);
      if (!result.success) {
        setError(result.error ?? 'فشل رفض التقرير');
        return;
      }
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={openDialog}
        data-testid="reject-report-button"
        className="flex items-center gap-1.5"
      >
        <XCircle className="size-4" aria-hidden="true" />
        <span>رفض التقرير</span>
      </Button>

      <dialog
        ref={dialogRef}
        className="fixed inset-0 m-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl backdrop:bg-black/50"
      >
        <h2 className="text-lg font-bold text-foreground">رفض تقرير التقدم الميداني</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          سيتم إعادة هذا التقرير إلى المهندس كمسودة للتصحيح مع إرفاق الملاحظات.
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="rejection-reason" className="block text-xs font-semibold text-foreground">
              سبب الرفض والملاحظات (اختياري)
            </label>
            <textarea
              id="rejection-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب أسباب الرفض أو التعديلات المطلوبة من المهندس..."
              className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="rejection-reason-input"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isSubmitting}
              data-testid="confirm-reject-button"
            >
              {isSubmitting ? 'جاري الرفض...' : 'تأكيد الرفض'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
