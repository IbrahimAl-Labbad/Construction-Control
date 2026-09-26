'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/edit-milestone-dialog.tsx
 *
 * Modal dialog for editing milestone metadata (title, description, targetDate).
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, AlertCircle } from 'lucide-react';
import { updateMilestoneAction } from '../actions';
import type { ProjectMilestoneDTO } from '@/lib/milestones';

interface EditMilestoneDialogProps {
  projectId: string;
  milestone: ProjectMilestoneDTO;
}

export function EditMilestoneDialog({
  projectId,
  milestone,
}: EditMilestoneDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description ?? '');
  const [targetDate, setTargetDate] = useState(milestone.targetDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTitle(milestone.title);
    setDescription(milestone.description ?? '');
    setTargetDate(milestone.targetDate);
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('title', title.trim());
    formData.set('description', description.trim());
    formData.set('targetDate', targetDate);

    const result = await updateMilestoneAction(projectId, milestone.id, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
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
        className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/80 transition-colors"
        data-testid="edit-milestone-button"
        title="تعديل بيانات المحطة"
      >
        <Pencil className="size-3" aria-hidden="true" />
        <span>تعديل</span>
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border border-border bg-card p-0 shadow-2xl backdrop:bg-black/50 w-full max-w-lg text-foreground overflow-hidden"
        onCancel={closeDialog}
      >
        <div className="border-b border-border bg-muted/40 p-5">
          <h2 className="text-lg font-bold text-foreground">
            تعديل بيانات محطة الإنجاز
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            تحديث العنوان، الوصف، أو التاريخ المستهدف للمحطة.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              data-testid="edit-milestone-error"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor={`edit-title-${milestone.id}`}
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              عنوان المحطة <span className="text-destructive">*</span>
            </label>
            <input
              id={`edit-title-${milestone.id}`}
              name="title"
              type="text"
              required
              minLength={2}
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="edit-milestone-title-input"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-target-date-${milestone.id}`}
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              التاريخ المستهدف <span className="text-destructive">*</span>
            </label>
            <input
              id={`edit-target-date-${milestone.id}`}
              name="targetDate"
              type="date"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="edit-milestone-target-date-input"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-desc-${milestone.id}`}
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              الوصف والنطاق (اختياري)
            </label>
            <textarea
              id={`edit-desc-${milestone.id}`}
              name="description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="edit-milestone-description-input"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={closeDialog}
              disabled={isSubmitting}
              className="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !targetDate}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              data-testid="confirm-edit-milestone-button"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'تحديث البيانات'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
