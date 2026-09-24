import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getProgressReport } from '@/lib/progress-reports';
import { ProgressReportStatus } from '@prisma/client';
import { ProgressReportForm } from '@/components/progress-reports';
import { updateProgressReportDraftAction } from '../../actions';
import { AppError } from '@/lib/errors';
import { ArrowRight, Pencil } from 'lucide-react';

interface EditProgressReportPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'تعديل مسودة تقرير التقدم الميداني',
  description: 'تعديل محتوى مسودة تقرير التقدم الميداني',
};

export default async function EditProgressReportPage({ params }: EditProgressReportPageProps) {
  const { id } = await params;

  let report;
  try {
    report = await getProgressReport(id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  // Invariant: Only DRAFT reports can be edited
  if (report.status !== ProgressReportStatus.DRAFT) {
    redirect(`/my-reports/${id}`);
  }

  async function handleUpdate(formData: FormData) {
    'use server';
    return updateProgressReportDraftAction(id, formData);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <Link
          href={`/my-reports/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowRight className="size-3.5" aria-hidden="true" />
          <span>العودة لتفاصيل التقرير</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Pencil className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              تعديل مسودة تقرير التقدم
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              تعديل بيانات وأنشطة التقرير قبل التقديم الرسمي للاعتماد
            </p>
          </div>
        </div>
      </div>

      <ProgressReportForm
        initialData={report}
        onSubmit={handleUpdate}
        isEdit={true}
      />
    </div>
  );
}
