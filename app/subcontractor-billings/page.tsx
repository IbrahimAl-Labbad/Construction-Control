import type { Metadata } from 'next';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { Plus, Receipt } from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getAllBillings } from '@/lib/subcontractor-billings';
import { BillingList } from './components/billing-list';

export const metadata: Metadata = {
  title: 'مستخلصات مقاولي الباطن',
  description: 'إدارة وتتبع مستخلصات مقاولي الباطن وسير اعتمادها',
};

export default async function SubcontractorBillingsPage() {
  const user = await requireAuth();

  // Purchasing role must not receive billing data or actions
  if (!policies.canViewBillings(user)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Receipt className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground">
              لا تملك صلاحية عرض مستخلصات مقاولي الباطن.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const isManager = user.role === Role.MANAGER;
  const isAccountant = user.role === Role.ACCOUNTANT;
  const isEngineer = user.role === Role.ENGINEER;
  const canCreate = isAccountant;

  const { billings, remainingBalances } = await getAllBillings();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">مستخلصات مقاولي الباطن</h1>
              <p className="text-sm text-muted-foreground">
                تتبع واعتماد مستخلصات الأعمال المنجزة وفق الالتزامات التعاقدية
              </p>
            </div>
          </div>

          {canCreate && (
            <Link
              href="/subcontractor-billings/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              data-testid="create-billing-button"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>إنشاء مستخلص جديد</span>
            </Link>
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'إجمالي المستخلصات',
              value: billings.length,
              className: 'text-foreground',
            },
            {
              label: 'قيد الاعتماد',
              value: billings.filter((b) => b.status === 'SUBMITTED').length,
              className: 'text-blue-600 dark:text-blue-400',
            },
            {
              label: 'معتمدة',
              value: billings.filter((b) => b.status === 'APPROVED').length,
              className: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'مسودات',
              value: billings.filter((b) => b.status === 'DRAFT').length,
              className: 'text-slate-600 dark:text-slate-400',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-4 text-center shadow-sm"
            >
              <p className={`text-2xl font-bold ${stat.className}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <BillingList
          billings={billings}
          isManager={isManager}
          isAccountant={isAccountant}
          isEngineer={isEngineer}
          currentUserId={user.id}
          remainingBalances={remainingBalances}
        />
      </main>
    </div>
  );
}
