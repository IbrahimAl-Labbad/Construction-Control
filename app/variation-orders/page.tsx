import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { listVariationOrders } from '@/lib/variation-orders';
import { VariationOrderList } from './components/variation-order-list';

export const metadata: Metadata = {
  title: 'أوامر التغيير',
  description: 'إدارة وتتبع أوامر التغيير وأثرها على الموازنة والارتباطات التعاقدية',
};

export default async function VariationOrdersPage() {
  const user = await requireAuth();

  if (!policies.canViewVariationOrders(user)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Layers className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground">
              لا تملك صلاحية استعراض أوامر التغيير.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const canCreate = policies.canCreateVariationOrder(user);
  const result = await listVariationOrders();
  const variations = result.items;

  const totalCount = variations.length;
  const submittedCount = variations.filter((v) => v.status === 'SUBMITTED').length;
  const approvedCount = variations.filter((v) => v.status === 'APPROVED').length;
  const draftCount = variations.filter((v) => v.status === 'DRAFT').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">أوامر التغيير</h1>
              <p className="text-sm text-muted-foreground">
                إدارة واعتماد أوامر التغيير وتعديلات النطاق والموازنة والارتباطات التعاقدية
              </p>
            </div>
          </div>

          {canCreate && (
            <Link
              href="/variation-orders/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              data-testid="create-variation-button"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>إنشاء أمر تغيير جديد</span>
            </Link>
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'إجمالي الأوامر',
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
              className="rounded-xl border border-border bg-card p-4 text-center shadow-xs"
            >
              <p className={`text-2xl font-bold ${stat.className}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Variations List */}
        <VariationOrderList variations={variations} />
      </main>
    </div>
  );
}
