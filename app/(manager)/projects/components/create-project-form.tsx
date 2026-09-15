'use client';

/**
 * app/(manager)/projects/components/create-project-form.tsx
 *
 * Client Component for project creation.
 * Follows AGENTS.md §26 (no server-only imports in client components).
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderPlus, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createProjectAction } from '../actions';

interface ManagerOption {
  id: string;
  name: string;
  email: string;
}

export interface CreateProjectFormProps {
  managers: ManagerOption[];
  defaultManagerId?: string;
}

interface FieldErrors {
  code?: string;
  name?: string;
  description?: string;
  location?: string;
  managerId?: string;
  startDate?: string;
  endDate?: string;
}

export function CreateProjectForm({
  managers,
  defaultManagerId,
}: CreateProjectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createProjectAction(formData);

      if (!result.success) {
        setErrorMessage(result.message);
        if (result.details) {
          const errors: FieldErrors = {};
          for (const detail of result.details) {
            const key = detail.path as keyof FieldErrors;
            errors[key] = detail.message;
          }
          setFieldErrors(errors);
        }
        return;
      }

      // Success: redirect to the projects list
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderPlus className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-foreground">بيانات المشروع الجديد</h2>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          العودة لقائمة المشاريع
        </Link>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          data-testid="form-error-banner"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{errorMessage}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Project Code */}
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-foreground"
            >
              كود المشروع <span className="text-destructive">*</span>
            </label>
            <input
              id="code"
              name="code"
              type="text"
              required
              placeholder="مثال: PRJ-RYD-01"
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-project-code"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              من 2 إلى 20 حرفاً إنجليزياً أو رقماً أو شرطة (- _)
            </p>
            {fieldErrors.code && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.code}
              </p>
            )}
          </div>

          {/* Project Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-foreground"
            >
              اسم المشروع <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="اسم المشروع الرسمي"
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-project-name"
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Project Manager */}
          <div>
            <label
              htmlFor="managerId"
              className="block text-sm font-medium text-foreground"
            >
              مدير المشروع المسؤول <span className="text-destructive">*</span>
            </label>
            <select
              id="managerId"
              name="managerId"
              required
              defaultValue={defaultManagerId ?? (managers[0]?.id || '')}
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="select-project-manager"
            >
              {managers.map((mgr) => (
                <option key={mgr.id} value={mgr.id}>
                  {mgr.name} ({mgr.email})
                </option>
              ))}
            </select>
            {fieldErrors.managerId && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.managerId}
              </p>
            )}
          </div>

          {/* Location */}
          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-foreground"
            >
              موقع المشروع
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="مثال: الرياض - حي الملقا"
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-project-location"
            />
            {fieldErrors.location && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.location}
              </p>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-foreground"
            >
              تاريخ البدء المخطط
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-project-start-date"
            />
            {fieldErrors.startDate && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.startDate}
              </p>
            )}
          </div>

          {/* End Date */}
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-foreground"
            >
              تاريخ الانتهاء المستهدف
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-project-end-date"
            />
            {fieldErrors.endDate && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.endDate}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-foreground"
          >
            وصف المشروع ونطاق العمل
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="وصف مختصر لأعمال ونطاق المشروع..."
            className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="textarea-project-description"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {fieldErrors.description}
            </p>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Link
            href="/projects"
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            إلغاء
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="gap-2"
            data-testid="submit-create-project-button"
          >
            <FolderPlus className="size-4" aria-hidden="true" />
            {isPending ? 'جاري إنشاء المشروع...' : 'إنشاء المشروع'}
          </Button>
        </div>
      </form>
    </div>
  );
}
