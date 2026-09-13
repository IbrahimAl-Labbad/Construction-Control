import type { Metadata } from 'next';

import '@/app/globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | نظام متابعة التشييد',
    default: 'نظام متابعة التشييد',
  },
  description:
    'طبقة المتابعة الإدارية لشركة المقاولات — رقابة مالية، موافقات، وتقارير تنفيذية',
  keywords: ['مقاولات', 'إدارة', 'رقابة مالية', 'تقارير'],
  authors: [{ name: 'Construction Control System' }],
  // RTL meta
  other: {
    'content-language': 'ar',
  },
};

/**
 * Root layout — wraps the entire application.
 *
 * Key decisions:
 * - lang="ar" dir="rtl" — Arabic-first, RTL layout for all pages
 * - Fonts loaded via CSS @import in globals.css (not next/font to avoid
 *   Arabic font subsetting issues)
 * - No business UI here — only structural HTML
 *
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head />
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
