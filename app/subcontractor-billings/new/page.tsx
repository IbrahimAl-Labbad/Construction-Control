import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Receipt } from 'lucide-react';
import { Role } from '@prisma/client';

import { requireAuth } from '@/lib/permissions';
import { getBillingFormData } from '@/lib/subcontractor-billings';
import { BillingForm } from '../components/billing-form';

export const metadata: Metadata = {
  title: 'إنشاء مستخلص مقاول باطن جديد',
  description: 'إنشاء مسودة مستخلص جديد مقابل التزام مقاول باطن معتمد',
};

export default async function NewBillingPage() {
  const user = await requireAuth();

  // Only ACCOUNTANT can create billings
  if (user.role !== Role.ACCOUNTANT) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <Receipt className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              إنشاء المستخلصات مقتصر على المحاسبين فقط.
            </p>
            <Link
              href="/subcontractor-billings"
              className="text-sm text-primary hover:underline"
            >
              العودة إلى قائمة المستخلصات
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const formData = await getBillingFormData();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link href="/subcontractor-billings" className="hover:text-foreground transition-colors">
            مستخلصات مقاولي الباطن
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">مستخلص جديد</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Receipt className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إنشاء مستخلص مقاول باطن</h1>
            <p className="text-sm text-muted-foreground">
              يُنشأ المستخلص مسودةً أولاً، ثم يُرفع للاعتماد بعد المراجعة
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <BillingForm formData={formData} />
        </div>
      </main>
    </div>
  );
}
