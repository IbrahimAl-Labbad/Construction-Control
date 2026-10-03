import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, Layers, AlertCircle } from 'lucide-react';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getVariationOrder, getVariationFormData } from '@/lib/variation-orders';
import { VariationOrderForm } from '../../components/variation-order-form';

interface EditVariationPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'تعديل مسودة أمر التغيير',
  description: 'تعديل تفاصيل وبنود مسودة أمر التغيير قبل رفعه للاعتماد',
};

export default async function EditVariationPage({ params }: EditVariationPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  let variation;
  try {
    variation = await getVariationOrder(id);
  } catch {
    notFound();
  }

  // Only DRAFT state can be edited
  if (variation.status !== 'DRAFT') {
    redirect(`/variation-orders/${id}`);
  }

  // Verify permission
  if (!policies.canManageVariationOrderDraft(user, { createdById: variation.createdById })) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <AlertCircle className="size-12 text-destructive/50 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              لا تملك صلاحية تعديل هذه المسودة.
            </p>
            <Link
              href={`/variation-orders/${id}`}
              className="text-sm text-primary hover:underline"
            >
              العودة إلى تفاصيل الأمر
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
          <Link
            href={`/variation-orders/${id}`}
            className="hover:text-foreground transition-colors font-mono"
          >
            {variation.orderNumber}
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">تعديل المسودة</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              تعديل مسودة أمر التغيير ({variation.orderNumber})
            </h1>
            <p className="text-sm text-muted-foreground">
              يمكنك تعديل بنود الكميات والمبررات والأثر المالي قبل رفع الأمر للاعتماد
            </p>
          </div>
        </div>

        {/* Form */}
        <VariationOrderForm projects={projects} initialData={variation} />
      </main>
    </div>
  );
}
