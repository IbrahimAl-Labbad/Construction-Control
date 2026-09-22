import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Users, ShieldAlert } from 'lucide-react';
import { Role } from '@prisma/client';

import { requireAuth } from '@/lib/permissions';
import { getPayrollFormData } from '@/lib/payroll';
import { PayrollForm } from '../components/payroll-form';

export const metadata: Metadata = {
  title: 'تسجيل قيد أجور عمالة جديد',
  description: 'تسجيل مسودة قيد أجور جديد على بند موازنة معتمد للمشروع',
};

export default async function NewPayrollPage() {
  const user = await requireAuth();

  // Only ACCOUNTANT can create payroll draft entries
  if (user.role !== Role.ACCOUNTANT) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-border bg-card">
            <ShieldAlert className="size-12 text-destructive mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground mb-6">
              تسجيل قيود أجور العمالة مقتصر على المحاسبين فقط.
            </p>
            <Link
              href="/payroll"
              className="text-sm text-primary hover:underline"
            >
              العودة إلى قائمة الأجور
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const formData = await getPayrollFormData();

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
          <span className="text-foreground font-medium">قيد جديد</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تسجيل قيد أجر عمالة</h1>
            <p className="text-sm text-muted-foreground">
              يُسجل القيد كمسودة أولاً، ويُرفع للاعتماد بعد التحقق من كشف الموقع
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <PayrollForm formData={formData} />
        </div>
      </main>
    </div>
  );
}
