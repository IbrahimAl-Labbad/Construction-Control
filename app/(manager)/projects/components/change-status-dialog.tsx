'use client';

/**
 * app/(manager)/projects/components/change-status-dialog.tsx
 *
 * Dialog for changing the project lifecycle status.
 *
 * Rules:
 * - Shows ONLY the statuses that are valid transitions from the current status.
 * - Includes optional reason input (≤500 chars).
 * - Client Component — receives allowed next statuses as a prop (no server imports).
 * - Calls changeProjectStatusAction server action.
 *
 * See AGENTS.md §4 (state machine) and §26 (server/client boundary).
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectStatus } from '@/lib/projects';
import { changeProjectStatusAction } from '../actions';

// ---------------------------------------------------------------------------
// Arabic labels for status values
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'قيد التخطيط',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChangeStatusDialogProps {
  projectId: string;
  currentStatus: ProjectStatus;
  allowedNextStatuses: readonly ProjectStatus[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChangeStatusDialog({
  projectId,
  currentStatus,
  allowedNextStatuses,
}: ChangeStatusDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedStatus, setSelectedStatus] = useState<ProjectStatus | ''>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setSelectedStatus('');
    setReason('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStatus) return;

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('newStatus', selectedStatus);
    if (reason.trim()) formData.set('reason', reason.trim());

    const result = await changeProjectStatusAction(projectId, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    closeDialog();
    router.refresh();
  }

  if (allowedNextStatuses.length === 0) {
    return null; // No transitions available (terminal state)
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-testid="change-status-button"
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        تغيير الحالة
      </button>

      <dialog
        ref={dialogRef}
        data-testid="change-status-dialog"
        className="rounded-xl border border-border bg-card shadow-xl backdrop:bg-black/40 w-full max-w-md p-0"
        onClose={closeDialog}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">تغيير حالة المشروع</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الحالة الحالية:{' '}
              <span className="font-medium text-foreground">
                {STATUS_LABELS[currentStatus]}
              </span>
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {/* Status selection */}
            <div>
              <label
                htmlFor="new-status-select"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                الحالة الجديدة <span className="text-destructive">*</span>
              </label>
              <select
                id="new-status-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as ProjectStatus)}
                required
                data-testid="select-new-status"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">-- اختر الحالة الجديدة --</option>
                {allowedNextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional reason */}
            <div>
              <label
                htmlFor="status-reason"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                السبب{' '}
                <span className="text-xs text-muted-foreground">(اختياري — 500 حرف كحد أقصى)</span>
              </label>
              <textarea
                id="status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                data-testid="status-reason-input"
                placeholder="أدخل سبب تغيير الحالة..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p
                role="alert"
                data-testid="status-dialog-error"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!selectedStatus || isSubmitting}
              data-testid="confirm-status-change-button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد التغيير'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
