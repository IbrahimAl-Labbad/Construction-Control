'use client';

/**
 * app/error.tsx
 *
 * Root segment error boundary for Next.js App Router.
 * Catches unhandled runtime and rendering errors in application pages.
 *
 * Ensures:
 * - Safe user-facing Arabic message without exposing stack traces or paths.
 * - Interactive retry action (`reset()`).
 * - Preserves Arabic/RTL layout and design tokens.
 * - Client-side error diagnostic reporting.
 *
 * Follows AGENTS.md §12, §19, and Slice 19 §12 specifications.
 */

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[RootError]', error.name, error.message, error.digest ? `(digest: ${error.digest})` : '');
  }, [error]);

  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center"
    >
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-8" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-bold text-foreground">حدث خطأ غير متوقع</h1>

      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        نعتذر عن هذا الخطأ أثناء معالجة طلبك. لقد تم تسجيل هذا الخطأ لأغراض المتابعة الفنية.
      </p>

      <Button
        variant="outline"
        className="mt-6 gap-2"
        onClick={reset}
        id="app-error-retry-button"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        إعادة المحاولة
      </Button>
    </div>
  );
}
