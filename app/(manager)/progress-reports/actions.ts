'use server';

/**
 * app/(manager)/progress-reports/actions.ts
 *
 * Server Actions for Manager Progress Report operations.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 */

import { revalidatePath } from 'next/cache';
import {
  approveProgressReport,
  rejectProgressReport,
  cancelProgressReport,
} from '@/lib/progress-reports';
import { handleActionError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';

function formatActionFailure(error: unknown, fallbackMessage: string): { success: false; error: string } {
  const result = handleActionError(error, fallbackMessage);
  return { success: false, error: result.message };
}

export async function approveProgressReportAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    const report = await approveProgressReport(id);
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    revalidatePath(`/projects/${report.projectId}`);
    revalidatePath(`/projects/${report.projectId}/progress`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل اعتماد التقرير');
  }
}

export async function rejectProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    const report = await rejectProgressReport(id, { rejectionReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    revalidatePath(`/projects/${report.projectId}`);
    revalidatePath(`/projects/${report.projectId}/progress`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل رفض التقرير');
  }
}

export async function cancelProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    const report = await cancelProgressReport(id, { cancellationReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    revalidatePath(`/projects/${report.projectId}`);
    revalidatePath(`/projects/${report.projectId}/progress`);
    return { success: true };
  } catch (error) {
    return formatActionFailure(error, 'فشل إلغاء التقرير');
  }
}

