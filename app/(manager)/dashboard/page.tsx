/**
 * app/(manager)/dashboard/page.tsx
 *
 * Executive Dashboard — Async Server Component.
 *
 * Authorization: Inherits requireRole(MANAGER) from (manager)/layout.tsx.
 * Additional fine-grained check enforced inside getDashboardSummary().
 *
 * Data freshness (BD-27):
 *   No `export const revalidate` directive.
 *   No `unstable_cache`. No ISR.
 *   requireAuth() reads cookies → Next.js treats this route as dynamic.
 *   Every request fetches live database state.
 *
 * No mutations. No approval actions. No date filters. No charts. (BD-36, BD-35)
 */

import type { Metadata } from 'next';
import { LayoutDashboard } from 'lucide-react';

import { Role } from '@prisma/client';
import { requireRole } from '@/lib/permissions';
import { getDashboardSummary } from '@/lib/dashboard/queries/get-dashboard-summary';
import { CompanySummaryPanel } from './components/company-summary-panel';
import { PendingApprovalsPanel } from './components/pending-approvals-panel';
import { ProjectFinancialTable } from './components/project-financial-table';

export const metadata: Metadata = {
  title: 'لوحة المتابعة التنفيذية',
  description: 'نظرة شاملة على الوضع المالي للمشاريع والموافقات المعلقة',
};

export default async function DashboardPage() {
  await requireRole(Role.MANAGER);
  const dashboard = await getDashboardSummary();

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutDashboard className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            لوحة المتابعة التنفيذية
          </h1>
          <p className="text-sm text-muted-foreground">
            نظرة شاملة على الوضع المالي للمشاريع والموافقات المعلقة
          </p>
        </div>
      </div>

      {/* Company-wide financial summary */}
      <CompanySummaryPanel summary={dashboard.companySummary} />

      {/* Pending approvals */}
      <PendingApprovalsPanel approvals={dashboard.pendingApprovals} />

      {/* Per-project financial table */}
      <ProjectFinancialTable projects={dashboard.projects} />

      {/* Data freshness notice */}
      <p className="text-xs text-muted-foreground/60 text-end">
        البيانات محدّثة في الوقت الفعلي
      </p>
    </div>
  );
}
