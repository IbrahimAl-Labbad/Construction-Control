'use client';

import { useEffect } from 'react';

/**
 * Global error boundary for the root layout.
 *
 * Catches unexpected errors that escape all other boundaries.
 * Never exposes technical details to users.
 *
 * See AGENTS.md §17 for error handling rules.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    // TODO (observability phase): integrate with error reporter
    // For now, the error is server-logged by Next.js
    void error;
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-background font-sans">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-destructive">خطأ</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            حدث خطأ غير متوقع
          </h2>
          <p className="mt-2 text-muted-foreground">
            نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
