'use client';

/**
 * app/(manager)/users/create-user-form.tsx
 *
 * Create user form — Client Component.
 *
 * Handles the "create new user" workflow:
 * 1. Collects name, email, role, and password from the manager.
 * 2. Submits via the createUserAction server action.
 * 3. Displays field-level validation errors (from the use case's Zod validation).
 * 4. Shows success feedback and resets the form.
 *
 * Security:
 * - Validation errors come from the server (use case) — not client-only.
 * - Password is never stored in component state longer than necessary.
 * - The form does not skip server-side validation on success.
 *
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

import { ROLE_METADATA, Role } from '@/lib/permissions/roles';
import { Button } from '@/components/ui/button';
import { createUserAction } from './actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = [
  { value: Role.MANAGER, label: ROLE_METADATA[Role.MANAGER].labelAr },
  { value: Role.ENGINEER, label: ROLE_METADATA[Role.ENGINEER].labelAr },
  { value: Role.ACCOUNTANT, label: ROLE_METADATA[Role.ACCOUNTANT].labelAr },
  { value: Role.PURCHASING, label: ROLE_METADATA[Role.PURCHASING].labelAr },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldErrors {
  name?: string;
  email?: string;
  role?: string;
  password?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create user form with server-action submission.
 * Refreshes the user list on success via router.refresh().
 */
export function CreateUserForm() {
  const router = useRouter();

  const [isPending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const formRef = React.useRef<HTMLFormElement>(null);

  function clearFeedback() {
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearFeedback();

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createUserAction(formData);

      if (result.success) {
        setSuccessMessage(
          `تم إنشاء المستخدم "${result.data.name}" بنجاح`,
        );
        formRef.current?.reset();
        // Refresh server component data (triggers re-fetch of listUsers)
        router.refresh();
      } else {
        // Map field-level errors from server
        if (result.details && result.details.length > 0) {
          const errors: FieldErrors = {};
          for (const detail of result.details) {
            const field = detail.path as keyof FieldErrors;
            if (field in errors === false) {
              errors[field] = detail.message;
            }
          }
          setFieldErrors(errors);
        }

        // Set form-level error for non-field errors (e.g. ALREADY_EXISTS)
        if (result.error !== 'VALIDATION_ERROR') {
          setFormError(result.message);
        }
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      {/* Success alert */}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800/30 dark:bg-green-900/20 dark:text-green-400"
          data-testid="create-user-success"
        >
          <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Form-level error */}
      {formError && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="create-user-error"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        id="create-user-form"
        aria-label="نموذج إنشاء مستخدم جديد"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Name */}
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-foreground"
            >
              الاسم الكامل <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              disabled={isPending}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              aria-invalid={!!fieldErrors.name}
              placeholder="أدخل الاسم الكامل"
              className={[
                'block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1',
                'disabled:cursor-not-allowed disabled:opacity-50',
                fieldErrors.name
                  ? 'border-destructive focus:border-destructive focus:ring-destructive'
                  : 'border-input focus:border-primary focus:ring-primary',
              ].join(' ')}
            />
            {fieldErrors.name && (
              <p id="name-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              البريد الإلكتروني <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              dir="ltr"
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
              placeholder="name@company.com"
              className={[
                'block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1',
                'disabled:cursor-not-allowed disabled:opacity-50',
                fieldErrors.email
                  ? 'border-destructive focus:border-destructive focus:ring-destructive'
                  : 'border-input focus:border-primary focus:ring-primary',
              ].join(' ')}
            />
            {fieldErrors.email && (
              <p id="email-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1">
            <label
              htmlFor="role"
              className="block text-sm font-medium text-foreground"
            >
              الدور <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <select
              id="role"
              name="role"
              required
              disabled={isPending}
              aria-describedby={fieldErrors.role ? 'role-error' : undefined}
              aria-invalid={!!fieldErrors.role}
              defaultValue=""
              className={[
                'block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm',
                'focus:outline-none focus:ring-1',
                'disabled:cursor-not-allowed disabled:opacity-50',
                fieldErrors.role
                  ? 'border-destructive focus:border-destructive focus:ring-destructive'
                  : 'border-input focus:border-primary focus:ring-primary',
              ].join(' ')}
            >
              <option value="" disabled>
                اختر الدور
              </option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.role && (
              <p id="role-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.role}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              كلمة المرور <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={isPending}
              dir="ltr"
              aria-describedby={
                fieldErrors.password ? 'password-error' : 'password-hint'
              }
              aria-invalid={!!fieldErrors.password}
              placeholder="••••••••"
              className={[
                'block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1',
                'disabled:cursor-not-allowed disabled:opacity-50',
                fieldErrors.password
                  ? 'border-destructive focus:border-destructive focus:ring-destructive'
                  : 'border-input focus:border-primary focus:ring-primary',
              ].join(' ')}
            />
            {fieldErrors.password ? (
              <p id="password-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="password-hint" className="text-xs text-muted-foreground">
                8 أحرف، حرف كبير، رقم، رمز خاص
              </p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="mt-5 flex justify-end">
          <Button
            id="create-user-submit"
            type="submit"
            disabled={isPending}
            aria-label="إنشاء المستخدم الجديد"
          >
            {isPending ? (
              <>
                <span
                  className="me-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
                جارٍ الإنشاء...
              </>
            ) : (
              <>
                <UserPlus className="size-4 me-2" aria-hidden="true" />
                إنشاء مستخدم
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
