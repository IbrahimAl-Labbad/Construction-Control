import type { Metadata } from 'next';
import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { LoginForm } from './login-form';

// ---------------------------------------------------------------------------
// Page-level metadata (server component — must NOT be in 'use client' file)
// ---------------------------------------------------------------------------
export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  description: 'سجّل دخولك إلى نظام متابعة التشييد',
};

/**
 * LoginPage — server component.
 *
 * Exports metadata so Next.js can set the <title> to:
 *   "تسجيل الدخول | نظام متابعة التشييد"
 *
 * The interactive LoginForm is a client component wrapped in Suspense
 * because it uses useSearchParams() which requires client-side hydration.
 */
export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[400px] w-full max-w-md items-center justify-center p-6">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
