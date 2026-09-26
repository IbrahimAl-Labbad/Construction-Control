'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/create-milestone-dialog.tsx
 *
 * Modal dialog for creating a new milestone on a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertCircle } from 'lucide-react';
import { createMilestoneAction } from '../actions';

interface CreateMilestoneDialogProps {
  projectId: string;
  disabled?: boolean;
  isProjectFrozen?: boolean;
}

export function CreateMilestoneDialog({
  projectId,
  disabled = false,
  isProjectFrozen = false,
}: CreateMilestoneDialogProps) {
  const isBlocked = disabled || isProjectFrozen;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTitle('');
    setDescription('');
    setTargetDate('');
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
    if (description.trim()) {
      formData.set('description', description.trim());
    }
    formData.set('targetDate', targetDate);

    const result = await createMilestoneAction(projectId, formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    closeDialog();
    router.refresh();
  }

  if (isBlocked) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        data-testid="create-milestone-button"
      >
        <Plus className="size-4" aria-hidden="true" />
        <span>إضافة محطة إنجاز</span>
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border border-border bg-card p-0 shadow-2xl backdrop:bg-black/50 w-full max-w-lg text-foreground overflow-hidden"
        onCancel={closeDialog}
      >
        <div className="border-b border-border bg-muted/40 p-5">
          <h2 className="text-lg font-bold text-foreground">
            إضافة محطة إنجاز جديدة
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            تسجيل محطة رئيسية في الجدول الزمني للمشروع مع تحديد تاريخ الاستحقاق المستهدف.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              data-testid="create-milestone-error"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="milestone-title"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              عنوان المحطة <span className="text-destructive">*</span>
            </label>
            <input
              id="milestone-title"
              name="title"
              type="text"
              required
              minLength={2}
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: انتهاء أعمال الهيكل الخرساني"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="milestone-title-input"
            />
          </div>

          <div>
            <label
              htmlFor="milestone-target-date"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              التاريخ المستهدف <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                id="milestone-target-date"
                name="targetDate"
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="milestone-target-date-input"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="milestone-description"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              الوصف والنطاق (اختياري)
            </label>
            <textarea
              id="milestone-description"
              name="description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ملاحظات تفصيلية أو مخرجات تعاقدية مراد تحقيقها..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="milestone-description-input"
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
              data-testid="confirm-create-milestone-button"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ المحطة'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
