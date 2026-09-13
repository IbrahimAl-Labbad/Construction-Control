import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'الصفحة الرئيسية',
};

/**
 * Root page — temporary landing.
 *
 * This page exists only as a structural placeholder.
 * In the next phase, this will redirect authenticated users to their
 * role-based dashboard and unauthenticated users to /login.
 *
 * DO NOT add business content here — see AGENTS.md §22.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          نظام متابعة التشييد
        </h1>
        <p className="mt-2 text-muted-foreground">
          جاهز للتكوين
        </p>
      </div>
    </main>
  );
}
