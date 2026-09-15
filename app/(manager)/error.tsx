'use client';

/**
 * app/(manager)/error.tsx
 *
 * Error boundary for the manager route group.
 *
 * Catches unhandled errors within the /(manager) layout segment, including
 * PermissionError thrown when a non-manager authenticated user attempts
 * to access manager-only routes.
 *
 * See Next.js App Router error handling docs.
 * See AGENTS.md §18 for authorization rules.
 */

import { useEffect } from 'react';
import { ShieldX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ManagerErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Manager-level error page.
 * Shown when an error propagates up from any page in the /(manager) group.
 *
 * NOTE: Do NOT import server-side modules (logger, env, prisma) here.
 * This is a client component — importing server-only code crashes the browser bundle.
 */
export default function ManagerError({ error, reset }: ManagerErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[ManagerError]', error.name, error.message);
  }, [error]);

  const isPermissionError =
    error.name === 'PermissionError' || error.message === 'INSUFFICIENT_ROLE';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="size-8" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-bold text-foreground">
        {isPermissionError ? 'غير مصرح بالدخول' : 'حدث خطأ'}
      </h1>

      <p className="mt-2 max-w-sm text-muted-foreground">
        {isPermissionError
          ? 'ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة.'
          : 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.'}
      </p>

      {!isPermissionError && (
        <Button
          variant="outline"
          className="mt-6"
          onClick={reset}
          id="error-retry-button"
        >
          <RefreshCw className="size-4 ms-2" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
