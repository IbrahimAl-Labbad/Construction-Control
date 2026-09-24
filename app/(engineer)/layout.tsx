/**
 * (engineer) route group layout.
 *
 * Enforces Site Engineer role authorization on the server.
 * All pages under /(engineer) are protected by this guard.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { ShieldX } from 'lucide-react';
import { requireRole, PermissionError } from '@/lib/permissions';
import { EngineerTopBar } from '@/components/shared/engineer-top-bar';

export default async function EngineerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireRole(Role.ENGINEER);
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
              ليس لديك الصلاحيات اللازمة للوصول إلى واجهة المهندس الميداني.
            </p>
          </main>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-background">
      <EngineerTopBar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
