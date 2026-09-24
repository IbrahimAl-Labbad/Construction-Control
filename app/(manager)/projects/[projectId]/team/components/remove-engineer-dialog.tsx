'use client';

/**
 * app/(manager)/projects/[projectId]/team/components/remove-engineer-dialog.tsx
 *
 * Modal dialog for confirming the removal of a Site Engineer from a project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Rules:
 * - Removal reason is strictly OPTIONAL (BD-11-13).
 * - Max 500 characters, trimmed.
 * - Calls removeEngineerAction server action.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, AlertCircle } from 'lucide-react';
import { removeEngineerAction } from '../actions';

interface RemoveEngineerDialogProps {
  projectId: string;
  assignmentId: string;
  engineerName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RemoveEngineerDialog({
  projectId,
  assignmentId,
  engineerName,
  isOpen,
  onClose,
}: RemoveEngineerDialogProps) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('assignmentId', assignmentId);
    if (reason.trim()) {
      formData.set('reason', reason.trim());
    }

    const result = await removeEngineerAction(projectId, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-engineer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-foreground shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <UserMinus className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="remove-engineer-title" className="text-lg font-bold">
              إلغاء تعيين المهندس من المشروع
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              سيتم نقل حالة التعيين إلى غير نشط والاحتفاظ بالسجل في ملف المشروع
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4"
            data-testid="remove-engineer-error"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-foreground">
            هل أنت متأكد من رغبتك في إلغاء تعيين المهندس{' '}
            <span className="font-semibold text-primary">{engineerName}</span> من هذا المشروع؟
          </p>

          <div>
            <label
              htmlFor="remove-reason"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              سبب إلغاء التعيين (اختياري، بحد أقصى 500 حرف)
            </label>
            <textarea
              id="remove-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="اكتب سبب إلغاء التعيين أو إعادة التوزيع الميداني إن وجد..."
              data-testid="remove-engineer-reason"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              data-testid="cancel-remove-engineer"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50"
              data-testid="confirm-remove-engineer"
            >
              {isSubmitting ? 'جاري الإلغاء...' : 'تأكيد إلغاء التعيين'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
