import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import { ChevronRight, Receipt } from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { getBilling, getBillingFormData } from '@/lib/subcontractor-billings';
import { BillingForm } from '../../components/billing-form';

export const metadata: Metadata = {
  title: 'تعديل مسودة المستخلص',
  description: 'تعديل بيانات مسودة مستخلص مقاول باطن',
};

interface EditBillingPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBillingPage({ params }: EditBillingPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  // Only ACCOUNTANT can edit billings
  if (user.role !== Role.ACCOUNTANT) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <Receipt className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              تعديل المستخلصات مقتصر على المحاسبين فقط.
            </p>
            <Link href={`/subcontractor-billings/${id}`} className="text-sm text-primary hover:underline">
              العودة لتفاصيل المستخلص
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Fetch the billing — notFound if not found or unauthorized
  let billing;
  try {
    billing = await getBilling(id);
  } catch {
    notFound();
  }

  // Guard: must be DRAFT and owned by current user
  if (billing.status !== 'DRAFT') {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <Receipt className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">لا يمكن تعديل هذا المستخلص</h1>
            <p className="text-sm text-muted-foreground mb-6">
              التعديل متاح فقط للمستخلصات في حالة مسودة (DRAFT).
              الحالة الحالية للمستخلص:{' '}
              <span className="font-mono font-semibold">{billing.status}</span>
            </p>
            <Link href={`/subcontractor-billings/${id}`} className="text-sm text-primary hover:underline">
              عرض تفاصيل المستخلص
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (billing.createdById !== user.id) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <Receipt className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالتعديل</h1>
            <p className="text-sm text-muted-foreground mb-6">
              لا يمكنك تعديل مستخلص أنشأه مستخدم آخر.
            </p>
            <Link href={`/subcontractor-billings/${id}`} className="text-sm text-primary hover:underline">
              عرض تفاصيل المستخلص
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Load form data for commitment selector (display-only in edit mode — only shows
  // the existing commitment since projectId/commitmentId/budgetLineId are immutable)
  const formData = await getBillingFormData().catch(() => ({ projects: [] }));

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
          <Link
            href={`/subcontractor-billings/${id}`}
            className="hover:text-foreground transition-colors font-mono"
          >
            {billing.referenceNumber ?? id.slice(-8).toUpperCase()}
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">تعديل</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Receipt className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تعديل مسودة المستخلص</h1>
            <p className="text-sm text-muted-foreground">
              المشروع والالتزام لا يمكن تغييرهما بعد الإنشاء
            </p>
          </div>
        </div>

        {/* Immutable context info */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">الحقول غير القابلة للتعديل:</p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>• المشروع: <span className="font-medium text-foreground">{billing.project?.name} ({billing.project?.code})</span></li>
            <li>• الالتزام: <span className="font-medium text-foreground">{billing.commitment?.vendorName}</span></li>
            <li>• بند الموازنة: <span className="font-medium text-foreground">{billing.budgetLine?.description}</span></li>
            <li>• مقاول الباطن: <span className="font-medium text-foreground">{billing.subcontractorName} (مشتق من الالتزام)</span></li>
          </ul>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <BillingForm formData={formData} existingBilling={billing} />
        </div>
      </main>
    </div>
  );
}
