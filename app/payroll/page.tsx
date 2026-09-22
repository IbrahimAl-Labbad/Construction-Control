import type { Metadata } from 'next';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { Plus, Users, ShieldAlert } from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getAllPayrollEntries } from '@/lib/payroll';
import { PayrollList } from './components/payroll-list';

export const metadata: Metadata = {
  title: 'قيود أجور العمالة الميدانية',
  description: 'إدارة وتتبع قيود أجور العمالة وسير اعتمادها الرقابي للمشاريع',
};

export default async function PayrollPage() {
  const user = await requireAuth();

  // Fail-closed authorization guard: Manager and Accountant only
  if (!policies.canViewPayrollDetails(user)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <ShieldAlert className="size-12 text-destructive mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground">
              لا تملك صلاحية استعراض قيود أجور العمالة التفصيلية.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const isManager = user.role === Role.MANAGER;
  const isAccountant = user.role === Role.ACCOUNTANT;
  const canCreate = isAccountant;

  const entries = await getAllPayrollEntries();

  // Aggregate stats from entries
  const totalCount = entries.length;
  const submittedCount = entries.filter((e) => e.status === 'SUBMITTED').length;
  const approvedCount = entries.filter((e) => e.status === 'APPROVED').length;
  const draftCount = entries.filter((e) => e.status === 'DRAFT').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                قيود أجور العمالة الميدانية
              </h1>
              <p className="text-sm text-muted-foreground">
                إدارة وتسجيل تكاليف الأجور والعمالة المباشرة على بنود الموازنة المعتمدة
              </p>
            </div>
          </div>

          {canCreate && (
            <Link
              href="/payroll/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              data-testid="create-payroll-button"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>تسجيل قيد أجر جديد</span>
            </Link>
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'إجمالي القيود',
              value: totalCount,
              className: 'text-foreground',
            },
            {
              label: 'قيد الاعتماد',
              value: submittedCount,
              className: 'text-blue-600 dark:text-blue-400',
            },
            {
              label: 'معتمدة',
              value: approvedCount,
              className: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'مسودات',
              value: draftCount,
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

        {/* Filterable Table */}
        <PayrollList
          entries={entries}
          isManager={isManager}
          isAccountant={isAccountant}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
