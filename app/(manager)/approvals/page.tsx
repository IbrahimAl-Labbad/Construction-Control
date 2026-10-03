import type { Metadata } from 'next';
import { requireManager } from '@/lib/permissions';
import {
  getAllTabTriage,
  getPendingCounts,
  getPendingExpenses,
  getPendingCommitments,
  getPendingCustodies,
  getPendingPayroll,
  getPendingBillings,
  getPendingVariations,
  type ApprovalsTab,
  type ApprovalItemDTO,
  type PendingCountsDTO,
} from '@/lib/approvals';

import { ApprovalsTabBar } from './components/approvals-tab-bar';
import { ApprovalCard } from './components/approval-card';
import { AllTabOverflowBanner } from './components/all-tab-overflow-banner';
import { ApprovalsEmptyState } from './components/approvals-empty-state';
import { ApprovalsPagination } from './components/approvals-pagination';

export const metadata: Metadata = {
  title: 'مركز الموافقات',
  description: 'مراجعة واعتماد المعاملات المقدمة عبر مركز الموافقات المركزي',
};

const VALID_TABS: readonly ApprovalsTab[] = [
  'all',
  'expenses',
  'commitments',
  'custodies',
  'payroll',
  'billings',
  'variations',
];

interface ApprovalsPageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
  }>;
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  // Hard manager-only authorization check
  await requireManager();

  const params = await searchParams;
  const rawTab = params.tab;
  const tab: ApprovalsTab =
    rawTab && VALID_TABS.includes(rawTab as ApprovalsTab)
      ? (rawTab as ApprovalsTab)
      : 'all';

  const rawPage = parseInt(params.page || '1', 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = 20;

  let items: ApprovalItemDTO[] = [];
  let counts: PendingCountsDTO = {
    expenses: 0,
    commitments: 0,
    custodies: 0,
    payroll: 0,
    billings: 0,
    variations: 0,
    total: 0,
  };
  let hasMoreBeyondWindow = false;
  let totalPages = 1;

  if (tab === 'all') {
    const feed = await getAllTabTriage();
    items = feed.items;
    counts = feed.counts;
    hasMoreBeyondWindow = feed.hasMoreBeyondWindow;
  } else {
    // Domain tab: fetch items for this domain and shared counts in parallel
    let domainPromise: Promise<{ items: ApprovalItemDTO[]; totalItems: number }>;

    switch (tab) {
      case 'expenses':
        domainPromise = getPendingExpenses({ page, pageSize });
        break;
      case 'commitments':
        domainPromise = getPendingCommitments({ page, pageSize });
        break;
      case 'custodies':
        domainPromise = getPendingCustodies({ page, pageSize });
        break;
      case 'payroll':
        domainPromise = getPendingPayroll({ page, pageSize });
        break;
      case 'billings':
        domainPromise = getPendingBillings({ page, pageSize });
        break;
      case 'variations':
        domainPromise = getPendingVariations({ page, pageSize });
        break;
    }

    const [domainResult, countsResult] = await Promise.all([
      domainPromise,
      getPendingCounts(),
    ]);

    items = domainResult.items;
    counts = countsResult;
    totalPages = Math.max(1, Math.ceil(domainResult.totalItems / pageSize));
  }

  return (
    <div className="space-y-6" data-testid="approvals-hub-page">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">مركز الموافقات</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          مراجعة واعتماد المعاملات المقدمة عبر مركز الموافقات المركزي
        </p>
      </div>

      {/* Navigation Tab Bar */}
      <ApprovalsTabBar activeTab={tab} counts={counts} />

      {/* Overflow Banner on All tab */}
      {tab === 'all' && hasMoreBeyondWindow && (
        <AllTabOverflowBanner
          totalCount={counts.total}
          displayedCount={items.length}
        />
      )}

      {/* Content Area */}
      {items.length === 0 ? (
        <ApprovalsEmptyState activeTab={tab} />
      ) : (
        <div className="space-y-4" data-testid="approvals-cards-list">
          {items.map((item) => (
            <ApprovalCard key={`${item.domain}-${item.id}`} item={item} />
          ))}
        </div>
      )}

      {/* Pagination (Domain tabs only) */}
      {tab !== 'all' && (
        <ApprovalsPagination page={page} totalPages={totalPages} tab={tab} />
      )}
    </div>
  );
}
