'use client';

/**
 * app/(manager)/projects/[projectId]/team/components/assign-engineer-dialog.tsx
 *
 * Modal dialog for assigning or reactivating a Site Engineer on a project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Rules:
 * - Receives list of AvailableEngineerOptionDTO as props.
 * - Displays "(إعادة تعيين)" badge if isReassignmentCandidate is true.
 * - Optional notes input (max 500 chars).
 * - Calls assignEngineerAction server action.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, AlertCircle } from 'lucide-react';
import { assignEngineerAction } from '../actions';
import type { AvailableEngineerOptionDTO } from '@/lib/project-team';

interface AssignEngineerDialogProps {
  projectId: string;
  availableEngineers: AvailableEngineerOptionDTO[];
  isProjectFrozen: boolean;
}

export function AssignEngineerDialog({
  projectId,
  availableEngineers,
  isProjectFrozen,
}: AssignEngineerDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setSelectedEngineerId('');
    setReason('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEngineerId) return;

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('engineerId', selectedEngineerId);
    if (reason.trim()) {
      formData.set('reason', reason.trim());
    }

    const result = await assignEngineerAction(projectId, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    closeDialog();
    router.refresh();
  }

  if (isProjectFrozen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-testid="assign-engineer-button"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        <span>تعيين مهندس للمشروع</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="assign-engineer-title"
        className="rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm max-w-lg w-full m-auto"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserPlus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="assign-engineer-title" className="text-lg font-bold">
                تعيين مهندس موقع للمشروع
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                إضافة مهندس موقع نشط إلى فريق العمل التشغيلي للمشروع
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4"
              data-testid="assign-engineer-error"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="engineer-select"
                className="block text-xs font-semibold text-foreground mb-1.5"
              >
                اختر المهندس <span className="text-destructive">*</span>
              </label>
              {availableEngineers.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg bg-muted/30">
                  لا يوجد مهندسون متاحون حالياً للتعيين في هذا المشروع
                </p>
              ) : (
                <select
                  id="engineer-select"
                  value={selectedEngineerId}
                  onChange={(e) => setSelectedEngineerId(e.target.value)}
                  required
                  data-testid="engineer-select"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">-- اختر مهندساً --</option>
                  {availableEngineers.map((eng) => (
                    <option key={eng.engineerId} value={eng.engineerId}>
                      {eng.engineerName} ({eng.engineerEmail})
                      {eng.isReassignmentCandidate ? ' — [إعادة تعيين]' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="assign-reason"
                className="block text-xs font-semibold text-foreground mb-1.5"
              >
                ملاحظات التعيين (اختياري، بحد أقصى 500 حرف)
              </label>
              <textarea
                id="assign-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="أدخل أي ملاحظات حول التكليف الميداني..."
                data-testid="assign-engineer-reason"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
                data-testid="cancel-assign-engineer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedEngineerId || availableEngineers.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                data-testid="confirm-assign-engineer"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'تأكيد التعيين'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
