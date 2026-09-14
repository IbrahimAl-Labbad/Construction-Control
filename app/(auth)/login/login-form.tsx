'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * LoginForm — client component.
 *
 * Separated from page.tsx so that page.tsx can remain a server component
 * and export Next.js Metadata. This is required by the App Router — metadata
 * exports are not allowed in 'use client' files.
 *
 * useSearchParams() is only safe inside a Suspense boundary; LoginPage
 * (the server component) wraps this component in <React.Suspense>.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: trimmedEmail,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result) {
        setError('تعذر الاتصال بخادم المصادقة. يرجى المحاولة مرة أخرى.');
        setIsLoading(false);
        return;
      }

      if (result.error) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب معطّل.');
        setIsLoading(false);
        return;
      }

      // Success — redirect to callbackUrl or root
      router.push(result.url ?? callbackUrl);
      router.refresh();
    } catch {
      setError('حدث خطأ غير متوقع. يرجى إعادة المحاولة.');
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md p-6">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            تسجيل الدخول
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            نظام متابعة التشييد — طبقة التحكم الإداري
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mt-6 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground text-start"
            >
              البريد الإلكتروني
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                <Mail className="size-4" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                placeholder="name@company.com"
                className="block w-full rounded-md border border-input bg-background py-2 ps-10 pe-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground text-start"
            >
              كلمة المرور
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                <Lock className="size-4" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••"
                className="block w-full rounded-md border border-input bg-background py-2 ps-10 pe-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin me-2" />
                جاري تسجيل الدخول...
              </>
            ) : (
              'تسجيل الدخول'
            )}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        الحسابات تدار مركزياً من قبل إدارة النظام
      </p>
    </div>
  );
}

export default LoginForm;
