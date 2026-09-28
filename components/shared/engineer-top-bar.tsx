'use client';

/**
 * components/shared/engineer-top-bar.tsx
 *
 * Minimal engineer top bar displayed across all site engineer pages.
 * Contains system name, navigation link to /my-reports, and logout button.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ClipboardList, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EngineerTopBar() {
  const pathname = usePathname();

  function handleLogout() {
    void signOut({ callbackUrl: '/login' });
  }

  const isMyProjects = pathname.startsWith('/my-projects');
  const isMyReports = pathname.startsWith('/my-reports');

  return (
    <header
      className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm"
      role="banner"
    >
      <div className="flex items-center justify-between px-6 py-3">
        {/* System title & Nav links — on the right in RTL */}
        <div className="flex items-center gap-6">
          <span className="text-base font-semibold text-foreground">
            نظام متابعة التشييد
          </span>
          <nav className="flex items-center gap-2" aria-label="التنقل الرئيسي للمهندس">
            <Link
              href="/my-projects"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isMyProjects
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-my-projects-link"
            >
              <FolderKanban className="size-3.5" aria-hidden="true" />
              مشاريعي
            </Link>
            <Link
              href="/my-reports"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isMyReports
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-my-reports-link"
            >
              <ClipboardList className="size-3.5" aria-hidden="true" />
              تقارير التقدم الميداني
            </Link>
          </nav>
        </div>

        {/* Logout — on the left in RTL */}
        <Button
          id="logout-button"
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-foreground"
          aria-label="تسجيل الخروج من النظام"
        >
          <LogOut className="size-4 ms-2" aria-hidden="true" />
          تسجيل الخروج
        </Button>
      </div>
    </header>
  );
}
