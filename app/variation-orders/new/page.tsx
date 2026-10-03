import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Layers } from 'lucide-react';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getVariationFormData } from '@/lib/variation-orders';
import { VariationOrderForm } from '../components/variation-order-form';

export const metadata: Metadata = {
  title: 'إنشاء أمر تغيير جديد',
  description: 'إنشاء مسودة أمر تغيير جديد للمشروع',
};

export default async function NewVariationOrderPage() {
  const user = await requireAuth();

  if (!policies.canCreateVariationOrder(user)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <Layers className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              إنشاء أوامر التغيير مقتصر على المهندسين الميدانيين أو المديرين فقط.
            </p>
            <Link
              href="/variation-orders"
              className="text-sm text-primary hover:underline"
            >
              العودة إلى قائمة أوامر التغيير
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const projects = await getVariationFormData();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link href="/variation-orders" className="hover:text-foreground transition-colors">
            أوامر التغيير
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">أمر تغيير جديد</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إنشاء أمر تغيير جديد</h1>
            <p className="text-sm text-muted-foreground">
              يُنشأ الأمر كمسودة أولاً، وتُحسب الفروقات المالية بدقة قبل رفعه للمدير للاعتماد
            </p>
          </div>
        </div>

        {/* Form */}
        <VariationOrderForm projects={projects} />
      </main>
    </div>
  );
}
