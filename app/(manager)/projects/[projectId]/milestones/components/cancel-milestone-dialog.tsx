'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/cancel-milestone-dialog.tsx
 *
 * Confirmation dialog for cancelling a milestone.
 * Cancellation is terminal and immutable. Requires cancellationReason.
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, AlertTriangle } from 'lucide-react';
import { cancelMilestoneAction } from '../actions';
import type { ProjectMilestoneDTO } from '@/lib/milestones';

interface CancelMilestoneDialogProps {
  projectId: string;
  milestone: ProjectMilestoneDTO;
  disabled?: boolean;
}

export function CancelMilestoneDialog({
  projectId,
  milestone,
  disabled = false,
}: CancelMilestoneDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setReason('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('سبب الإلغاء مطلوب');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('cancellationReason', reason.trim());

    const result = await cancelMilestoneAction(projectId, milestone.id, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    closeDialog();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title="إلغاء المعلم"
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <XCircle className="h-3.5 w-3.5" />
        <span>إلغاء</span>
      </button>

      <dialog
        ref={dialogRef}
        className="backdrop:bg-black/40 backdrop:backdrop-blur-sm rounded-xl p-0 shadow-2xl border border-slate-200 max-w-md w-full bg-white text-slate-800"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 text-rose-600 mb-4">
            <div className="p-2 bg-rose-50 rounded-lg">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">إلغاء المعلم</h3>
              <p className="text-xs text-slate-500">
                إجراء نهائي غير قابل للتراجع
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            هل أنت متأكد من رغبتك في إلغاء المعلم:{' '}
            <strong className="text-slate-900 font-medium">«{milestone.title}»</strong>؟
            عند الإلغاء، لا يمكن إعادة فتح المعلم أو تعديله مرة أخرى.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="cancellationReason"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                سبب الإلغاء <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="cancellationReason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
                placeholder="أدخل سبب إلغاء هذا المعلم بالتفصيل (حد أقصى 500 حرف)..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 text-start"
              />
              <span className="text-[11px] text-slate-400 block text-end mt-1">
                {reason.length} / 500
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                تراجع
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {isSubmitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
