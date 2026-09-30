'use client';

/**
 * components/shared/accountant-top-bar.tsx
 *
 * Reusable top bar displayed across accountant pages.
 *
 * Contains:
 * - Arabic system name (right side in RTL)
 * - Navigation links for:
 *   - Payroll (/payroll)
 *   - Subcontractor Billings (/subcontractor-billings)
 *   - Commitments (/commitments)
 *   - Custodies (/custodies)
 *   - Expenses (/expenses)
 * - Logout button using NextAuth signOut (left side in RTL)
 *
 * See AGENTS.md §19 for RTL/Arabic UI rules.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LogOut,
  Users,
  FileText,
  FileSignature,
  Wallet,
  Receipt,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export function AccountantTopBar() {
  const pathname = usePathname();

  function handleLogout() {
    void signOut({ callbackUrl: '/login' });
  }

  const isPayroll = pathname.startsWith('/payroll');
  const isBillings = pathname.startsWith('/subcontractor-billings');
  const isCommitments = pathname.startsWith('/commitments');
  const isCustodies = pathname.startsWith('/custodies');
  const isExpenses = pathname.startsWith('/expenses');

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
          <nav className="flex items-center gap-2" aria-label="التنقل الرئيسي للمحاسب">
            <Link
              href="/payroll"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isPayroll
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-payroll-link"
            >
              <Users className="size-3.5" aria-hidden="true" />
              الأجور والرواتب
            </Link>
            <Link
              href="/subcontractor-billings"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isBillings
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-subcontractor-billings-link"
            >
              <FileText className="size-3.5" aria-hidden="true" />
              مستخلصات المقاولين
            </Link>
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
            <Link
              href="/custodies"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isCustodies
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-custodies-link"
            >
              <Wallet className="size-3.5" aria-hidden="true" />
              العهد
            </Link>
            <Link
              href="/expenses"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isExpenses
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="nav-expenses-link"
            >
              <Receipt className="size-3.5" aria-hidden="true" />
              المصروفات
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
