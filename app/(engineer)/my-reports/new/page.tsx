import type { Metadata } from 'next';
import Link from 'next/link';
import { getActiveProjectsForEngineer } from '@/lib/progress-reports';
import { ProgressReportForm } from '@/components/progress-reports';
import { createProgressReportDraftAction } from '../actions';
import { ClipboardList, ArrowRight, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إنشاء تقرير تقدم ميداني جديد',
  description: 'تسجيل مسودة تقرير تقدم ميداني جديد للمشروع',
};

export default async function NewProgressReportPage() {
  const activeProjects = await getActiveProjectsForEngineer();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <Link
          href="/my-reports"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowRight className="size-3.5" aria-hidden="true" />
          <span>العودة لقائمة التقارير</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              إنشاء تقرير تقدم ميداني جديد
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              توثيق الأنشطة التشغيلية وسير الأعمال اليومية في الموقع
            </p>
          </div>
        </div>
      </div>

      {activeProjects.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <AlertTriangle className="size-8 mx-auto text-amber-600 dark:text-amber-400 mb-2" aria-hidden="true" />
          <h2 className="text-sm font-bold text-foreground">لا توجد مشاريع نشطة متاحة</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            لا يمكن إنشاء تقرير تقدم حالياً لعدم وجود مشاريع في حالة &quot;نشط&quot; في النظام.
          </p>
          <Link
            href="/my-reports"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <span>العودة للقائمة</span>
          </Link>
        </div>
      ) : (
        <ProgressReportForm
          projects={activeProjects}
          onSubmit={createProgressReportDraftAction}
          isEdit={false}
        />
      )}
    </div>
  );
}
