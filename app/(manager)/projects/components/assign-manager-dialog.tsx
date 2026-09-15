'use client';

/**
 * app/(manager)/projects/components/assign-manager-dialog.tsx
 *
 * Dialog for re-assigning the responsible manager for a project.
 *
 * Rules:
 * - Receives list of active managers as props (no server imports).
 * - Excludes current manager from the selection list.
 * - Includes optional reason input (≤500 chars).
 * - Client Component — calls assignProjectManagerAction server action.
 *
 * See AGENTS.md §26 (server/client boundary).
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { assignProjectManagerAction } from '../actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ManagerOption {
  id: string;
  name: string;
  email: string;
}

interface AssignManagerDialogProps {
  projectId: string;
  currentManagerId: string;
  managers: ManagerOption[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssignManagerDialog({
  projectId,
  currentManagerId,
  managers,
}: AssignManagerDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exclude the current manager from the selection
  const availableManagers = managers.filter((m) => m.id !== currentManagerId);

  function openDialog() {
    setSelectedManagerId('');
    setReason('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedManagerId) return;

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('newManagerId', selectedManagerId);
    if (reason.trim()) formData.set('reason', reason.trim());

    const result = await assignProjectManagerAction(projectId, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    closeDialog();
    router.refresh();
  }

  if (availableManagers.length === 0) {
    return null; // No other managers available
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-testid="assign-manager-button"
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        تغيير المدير
      </button>

      <dialog
        ref={dialogRef}
        data-testid="assign-manager-dialog"
        className="rounded-xl border border-border bg-card shadow-xl backdrop:bg-black/40 w-full max-w-md p-0"
        onClose={closeDialog}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">إعادة تعيين مدير المشروع</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر المدير الجديد المسؤول عن هذا المشروع
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {/* Manager selection */}
            <div>
              <label
                htmlFor="new-manager-select"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                المدير الجديد <span className="text-destructive">*</span>
              </label>
              <select
                id="new-manager-select"
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                required
                data-testid="select-new-manager"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">-- اختر المدير الجديد --</option>
                {availableManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Optional reason */}
            <div>
              <label
                htmlFor="assign-manager-reason"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                السبب{' '}
                <span className="text-xs text-muted-foreground">(اختياري — 500 حرف كحد أقصى)</span>
              </label>
              <textarea
                id="assign-manager-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                data-testid="assign-manager-reason-input"
                placeholder="أدخل سبب تغيير المدير..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p
                role="alert"
                data-testid="assign-manager-dialog-error"
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
              disabled={!selectedManagerId || isSubmitting}
              data-testid="confirm-assign-manager-button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد التعيين'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
