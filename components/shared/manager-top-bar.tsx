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

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Minimal top bar for the manager interface.
 *
 * RTL layout: System name appears on the right, logout on the left.
 */
export function ManagerTopBar() {
  function handleLogout() {
    void signOut({ callbackUrl: '/login' });
  }

  return (
    <header
      className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm"
      role="banner"
    >
      <div className="flex items-center justify-between px-6 py-3">
        {/* System title — on the right in RTL */}
        <span className="text-base font-semibold text-foreground">
          نظام متابعة التشييد
        </span>

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
