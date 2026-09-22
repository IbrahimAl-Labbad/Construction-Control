import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import { ChevronRight, Users, ShieldAlert, AlertTriangle } from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { getPayrollEntry, getPayrollFormData } from '@/lib/payroll';
import { PayrollForm } from '../../components/payroll-form';

export const metadata: Metadata = {
  title: 'تعديل مسودة قيد الأجر',
  description: 'تعديل بيانات مسودة قيد أجر العمالة قبل التقديم للاعتماد',
};

interface EditPayrollPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPayrollPage({ params }: EditPayrollPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  // Only ACCOUNTANT can edit payroll drafts
  if (user.role !== Role.ACCOUNTANT) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <ShieldAlert className="size-12 text-destructive mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              تعديل قيود الأجور مقتصر على المحاسبين فقط.
            </p>
            <Link href={`/payroll/${id}`} className="text-sm text-primary hover:underline">
              العودة لتفاصيل قيد الأجر
            </Link>
          </div>
        </main>
      </div>
    );
  }

  let payroll;
  try {
    payroll = await getPayrollEntry(id);
  } catch {
    notFound();
  }

  // Guard: must be DRAFT
  if (payroll.status !== 'DRAFT') {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <AlertTriangle className="size-12 text-amber-500 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">لا يمكن تعديل هذا القيد</h1>
            <p className="text-sm text-muted-foreground mb-6">
              التعديل متاح فقط لقيود الأجور في حالة مسودة (DRAFT).
              الحالة الحالية للقيد:{' '}
              <span className="font-semibold text-foreground">{payroll.status}</span>
            </p>
            <Link href={`/payroll/${id}`} className="text-sm text-primary hover:underline">
              عرض تفاصيل قيد الأجر
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Guard: must be owner
  if (payroll.createdById !== user.id) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <ShieldAlert className="size-12 text-destructive mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالتعديل</h1>
            <p className="text-sm text-muted-foreground mb-6">
              لا يمكنك تعديل قيد أجور أنشأه محاسب آخر.
            </p>
            <Link href={`/payroll/${id}`} className="text-sm text-primary hover:underline">
              عرض تفاصيل قيد الأجر
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const formData = await getPayrollFormData().catch(() => ({ projects: [] }));

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link href="/payroll" className="hover:text-foreground transition-colors">
            قيود أجور العمالة الميدانية
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <Link
            href={`/payroll/${id}`}
            className="hover:text-foreground transition-colors"
          >
            {payroll.workerName}
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">تعديل</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تعديل مسودة قيد الأجر</h1>
            <p className="text-sm text-muted-foreground">
              تعديل بيانات العامل والمبلغ وفترة القيد قبل التقديم للاعتماد
            </p>
          </div>
        </div>

        {/* Context banner */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-6 text-sm">
          <p className="font-semibold text-primary mb-1">بيانات المسودة الحالية:</p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>• المشروع: <span className="font-medium text-foreground">{payroll.project?.name} ({payroll.project?.code})</span></li>
            <li>• بند الموازنة: <span className="font-medium text-foreground">{payroll.budgetLine?.description}</span></li>
            <li>• الفترة الحالية: <span className="font-medium text-foreground">{payroll.periodFormattedAr}</span></li>
          </ul>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <PayrollForm formData={formData} existingPayroll={payroll} />
        </div>
      </main>
    </div>
  );
}
