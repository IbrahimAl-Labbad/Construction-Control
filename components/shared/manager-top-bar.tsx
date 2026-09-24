'use client';

/**
 * components/shared/manager-top-bar.tsx
 *
 * Minimal manager top bar displayed across all manager pages.
 *
 * Contains:
 * - Arabic system name (right side in RTL)
 * - Logout button using the existing NextAuth signOut mechanism (left side in RTL)
 *
 * This is a client component because it calls signOut() from next-auth/react.
 * No navigation, no sidebar — those are deferred to a future navigation slice.
 *
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, FolderKanban, Users, LayoutDashboard, ClipboardList } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Minimal top bar for the manager interface.
 *
 * RTL layout: System name appears on the right, logout on the left.
 */
export function ManagerTopBar() {
  const pathname = usePathname();

  function handleLogout() {
    void signOut({ callbackUrl: '/login' });
  }

  const isDashboard = pathname.startsWith('/dashboard');
  const isProjects = pathname.startsWith('/projects');
  const isProgressReports = pathname.startsWith('/progress-reports');
  const isUsers = pathname.startsWith('/users');

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
          <nav className="flex items-center gap-2" aria-label="التنقل الرئيسي">
            {/* Dashboard link — added in Vertical Slice 9 (BD-29: login landing unchanged) */}
            <Link
              href="/dashboard"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isDashboard
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-dashboard-link"
            >
              <LayoutDashboard className="size-3.5" aria-hidden="true" />
              لوحة المتابعة
            </Link>
            <Link
              href="/projects"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isProjects
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-projects-link"
            >
              <FolderKanban className="size-3.5" aria-hidden="true" />
              المشاريع
            </Link>
            <Link
              href="/progress-reports"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isProgressReports
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-progress-reports-link"
            >
              <ClipboardList className="size-3.5" aria-hidden="true" />
              تقارير التقدم
            </Link>
            <Link
              href="/users"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isUsers
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-users-link"
            >
              <Users className="size-3.5" aria-hidden="true" />
              المستخدمون
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
