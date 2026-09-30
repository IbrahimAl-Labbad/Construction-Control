/**
 * (accountant) route group layout.
 *
 * Enforces Accountant role authorization on the server.
 * All pages under /(accountant) are protected by this guard.
 *
 * Renders the AccountantTopBar above page content.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { ShieldX } from 'lucide-react';
import { requireRole, PermissionError } from '@/lib/permissions';
import { AccountantTopBar } from '@/components/shared/accountant-top-bar';

export default async function AccountantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // Server-side authorization guard
    await requireRole(Role.ACCOUNTANT);
  } catch (error) {
    if (error instanceof PermissionError) {
      return (
        <div className="min-h-screen bg-background">
          <main className="mx-auto flex min-h-[60vh] max-w-7xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldX className="size-8" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">غير مصرح بالدخول</h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              ليس لديك الصلاحيات اللازمة للوصول إلى واجهة المحاسب.
            </p>
          </main>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-background">
      <AccountantTopBar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

