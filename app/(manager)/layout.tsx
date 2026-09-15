/**
 * (manager) route group layout.
 *
 * Enforces Manager-only role authorization on the server.
 * All pages under /(manager) are protected by this guard.
 * Renders the minimal manager top bar above page content.
 *
 * See AGENTS.md §18 for authorization rules.
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */

import { Role } from '@prisma/client';
import { ShieldX } from 'lucide-react';
import { requireRole, PermissionError } from '@/lib/permissions';
import { ManagerTopBar } from '@/components/shared/manager-top-bar';

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization guard — enforced before any page renders
  try {
    await requireRole(Role.MANAGER);
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
              ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة.
            </p>
          </main>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-background">
      <ManagerTopBar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
