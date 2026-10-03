'use server';

/**
 * app/(engineer)/my-reports/actions.ts
 *
 * Server Actions for Site Engineer Progress Report operations.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 */

import { revalidatePath } from 'next/cache';
import {
  createProgressReportDraft,
  updateProgressReportDraft,
  submitProgressReport,
  reopenProgressReport,
  cancelProgressReport,
} from '@/lib/progress-reports';
import { handleActionError } from '@/lib/errors';

function formatActionFailure(error: unknown, fallbackMessage: string): { success: false; error: string } {
  const result = handleActionError(error, fallbackMessage);
  return { success: false, error: result.message };
}

export async function createProgressReportDraftAction(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  id?: string;
}> {
  try {
    const projectId = formData.get('projectId') as string;
    const reportDate = formData.get('reportDate') as string;
    const title = formData.get('title') as string;
    const workDescription = formData.get('workDescription') as string;
    const progressPercentageRaw = formData.get('progressPercentage') as string | null;
    const blockers = formData.get('blockers') as string | null;
    const nextPeriodPlan = formData.get('nextPeriodPlan') as string | null;
    const weatherCondition = formData.get('weatherCondition') as string | null;

    const report = await createProgressReportDraft({
      projectId,
      reportDate,
      title,
      workDescription,
      progressPercentage: progressPercentageRaw ? parseInt(progressPercentageRaw, 10) : null,
      blockers: blockers || null,
      nextPeriodPlan: nextPeriodPlan || null,
      weatherCondition: weatherCondition || null,
    });

    revalidatePath('/my-reports');
    return { success: true, id: report.id };
  } catch (error) {
    return formatActionFailure(error, 'حدث خطأ غير متوقع أثناء حفظ التقرير');
  }
}

export async function updateProgressReportDraftAction(
  id: string,
  formData: FormData,
): Promise<{
  success: boolean;
  error?: string;
  id?: string;
}> {
  try {
    const title = formData.get('title') as string;
    const workDescription = formData.get('workDescription') as string;
    const progressPercentageRaw = formData.get('progressPercentage') as string | null;
    const blockers = formData.get('blockers') as string | null;
    const nextPeriodPlan = formData.get('nextPeriodPlan') as string | null;
    const weatherCondition = formData.get('weatherCondition') as string | null;

    const report = await updateProgressReportDraft(id, {
      title,
      workDescription,
      progressPercentage: progressPercentageRaw ? parseInt(progressPercentageRaw, 10) : null,
      blockers: blockers || null,
      nextPeriodPlan: nextPeriodPlan || null,
      weatherCondition: weatherCondition || null,
    });

    revalidatePath('/my-reports');
    revalidatePath(`/my-reports/${id}`);
    revalidatePath(`/my-reports/${id}/edit`);
    return { success: true, id: report.id };
  } catch (error) {
    return formatActionFailure(error, 'حدث خطأ غير متوقع أثناء تحديث التقرير');
  }
}

export async function submitProgressReportAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await submitProgressReport(id);
    revalidatePath('/my-reports');
    revalidatePath(`/my-reports/${id}`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل تقديم التقرير');
  }
}

export async function reopenProgressReportAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await reopenProgressReport(id);
    revalidatePath('/my-reports');
    revalidatePath(`/my-reports/${id}`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل إعادة فتح التقرير');
  }
}

export async function cancelProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await cancelProgressReport(id, { cancellationReason: reason });
    revalidatePath('/my-reports');
    revalidatePath(`/my-reports/${id}`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل إلغاء التقرير');
  }
}
