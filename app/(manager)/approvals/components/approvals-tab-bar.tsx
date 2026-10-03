'use client';

/**
 * app/(manager)/approvals/components/approvals-tab-bar.tsx
 *
 * Tab navigation bar for the Approvals Hub.
 * Renders 6 tabs (All + 5 domains) with active styling and real-time count badges.
 *
 * Follows AGENTS.md §19 (RTL/Arabic-first UI).
 */

import Link from 'next/link';
import type { ApprovalsTab, PendingCountsDTO } from '@/lib/approvals';

interface ApprovalsTabBarProps {
  activeTab: ApprovalsTab;
  counts: PendingCountsDTO;
}

interface TabDef {
  key: ApprovalsTab;
  label: string;
  href: string;
  count: number;
}

export function ApprovalsTabBar({ activeTab, counts }: ApprovalsTabBarProps) {
  const tabs: TabDef[] = [
    {
      key: 'all',
      label: 'الكل',
      href: '/approvals?tab=all',
      count: counts.total,
    },
    {
      key: 'expenses',
      label: 'المصروفات',
      href: '/approvals?tab=expenses',
      count: counts.expenses,
    },
    {
      key: 'commitments',
      label: 'الارتباطات',
      href: '/approvals?tab=commitments',
      count: counts.commitments,
    },
    {
      key: 'custodies',
      label: 'العهد',
      href: '/approvals?tab=custodies',
      count: counts.custodies,
    },
    {
      key: 'payroll',
      label: 'أجور العمالة',
      href: '/approvals?tab=payroll',
      count: counts.payroll,
    },
    {
      key: 'billings',
      label: 'المستخلصات',
      href: '/approvals?tab=billings',
      count: counts.billings,
    },
    {
      key: 'variations',
      label: 'أوامر التغيير',
      href: '/approvals?tab=variations',
      count: counts.variations,
    },
  ];

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-1"
      role="tablist"
      aria-label="أقسام المعاملات المعلقة"
      data-testid="approvals-tab-bar"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
              isActive
                ? 'border-primary bg-primary/5 text-primary font-bold'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
            }`}
            data-testid={`tab-link-${tab.key}`}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
                data-testid={`tab-badge-${tab.key}`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
