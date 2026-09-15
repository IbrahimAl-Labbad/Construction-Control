'use client';

/**
 * app/(manager)/projects/components/edit-project-form.tsx
 *
 * Client Component for editing project metadata.
 *
 * Updates: name, description, location, startDate, endDate, reason.
 * Status is NOT editable here — ChangeStatusDialog handles that.
 *
 * Calls updateProjectAction server action on submit.
 * Redirects to project details page on success.
 *
 * See AGENTS.md §26 (server/client boundary).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectDetails } from '@/lib/projects';
import { updateProjectAction } from '../actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateToInputValue(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditProjectFormProps {
  project: ProjectDetails;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditProjectForm({ project }: EditProjectFormProps) {
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [location, setLocation] = useState(project.location ?? '');
  const [startDate, setStartDate] = useState(dateToInputValue(project.startDate));
  const [endDate, setEndDate] = useState(dateToInputValue(project.endDate));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.set('name', name);
    formData.set('description', description);
    formData.set('location', location);
    formData.set('startDate', startDate);
    formData.set('endDate', endDate);
    if (reason.trim()) formData.set('reason', reason.trim());

    const result = await updateProjectAction(project.id, formData);
    setIsSubmitting(false);

    if (!result.success) {
      if (result.error === 'VALIDATION_ERROR' && result.details) {
        const fieldMap: Record<string, string> = {};
        result.details.forEach(({ path, message }) => {
          fieldMap[path] = message;
        });
        setFieldErrors(fieldMap);
      } else {
        setError(result.message);
      }
      return;
    }

    router.push(`/projects/${project.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
      data-testid="edit-project-form"
    >
      {/* Global error banner */}
      {error && (
        <div
          role="alert"
          data-testid="edit-form-error-banner"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Project Code (read-only) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
          كود المشروع (لا يمكن تعديله)
        </label>
        <div className="rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
          {project.code}
        </div>
      </div>

      {/* Name */}
      <div>
        <label
          htmlFor="edit-project-name"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          اسم المشروع <span className="text-destructive">*</span>
        </label>
        <input
          id="edit-project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="edit-input-project-name"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {fieldErrors['name'] && (
          <p className="mt-1 text-xs text-destructive">{fieldErrors['name']}</p>
        )}
      </div>

      {/* Location */}
      <div>
        <label
          htmlFor="edit-project-location"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          الموقع{' '}
          <span className="text-xs text-muted-foreground">(اختياري)</span>
        </label>
        <input
          id="edit-project-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          data-testid="edit-input-project-location"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {fieldErrors['location'] && (
          <p className="mt-1 text-xs text-destructive">{fieldErrors['location']}</p>
        )}
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="edit-start-date"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            تاريخ البدء{' '}
            <span className="text-xs text-muted-foreground">(اختياري)</span>
          </label>
          <input
            id="edit-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="edit-input-start-date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {fieldErrors['startDate'] && (
            <p className="mt-1 text-xs text-destructive">{fieldErrors['startDate']}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="edit-end-date"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            تاريخ الانتهاء{' '}
            <span className="text-xs text-muted-foreground">(اختياري)</span>
          </label>
          <input
            id="edit-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-testid="edit-input-end-date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {fieldErrors['endDate'] && (
            <p className="mt-1 text-xs text-destructive">{fieldErrors['endDate']}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="edit-project-description"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          الوصف{' '}
          <span className="text-xs text-muted-foreground">(اختياري)</span>
        </label>
        <textarea
          id="edit-project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          data-testid="edit-textarea-project-description"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        {fieldErrors['description'] && (
          <p className="mt-1 text-xs text-destructive">{fieldErrors['description']}</p>
        )}
      </div>

      {/* Reason */}
      <div>
        <label
          htmlFor="edit-reason"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          سبب التعديل{' '}
          <span className="text-xs text-muted-foreground">(اختياري — 500 حرف كحد أقصى)</span>
        </label>
        <textarea
          id="edit-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          data-testid="edit-reason-input"
          placeholder="أدخل سبب التعديل للسجل التدقيقي..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit-edit-project-button"
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
        </button>
      </div>
    </form>
  );
}
