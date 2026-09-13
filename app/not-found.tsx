import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'صفحة غير موجودة',
};

/**
 * 404 Not Found page.
 * Returned by Next.js when no route matches.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-muted-foreground">٤٠٤</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">
          الصفحة غير موجودة
        </h2>
        <p className="mt-2 text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <a
          href="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          العودة للرئيسية
        </a>
      </div>
    </main>
  );
}
