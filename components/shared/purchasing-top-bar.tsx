'use client';

/**
 * components/shared/purchasing-top-bar.tsx
 *
 * Reusable top bar displayed across purchasing officer pages.
 *
 * Contains:
 * - Arabic system name (right side in RTL)
 * - Navigation link to Commitments (/commitments)
 * - Logout button using NextAuth signOut (left side in RTL)
 *
 * See AGENTS.md §19 for RTL/Arabic UI rules.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, FileSignature } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function PurchasingTopBar() {
  const pathname = usePathname();

  function handleLogout() {
    void signOut({ callbackUrl: '/login' });
  }

  const isCommitments = pathname.startsWith('/commitments');

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
          <nav className="flex items-center gap-2" aria-label="التنقل الرئيسي لمسؤول المشتريات">
            <Link
              href="/commitments"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isCommitments
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-commitments-link"
            >
              <FileSignature className="size-3.5" aria-hidden="true" />
              الارتباطات
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
