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
import { AppError } from '@/lib/errors';

export async function approveProgressReportAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await approveProgressReport(id);
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'فشل اعتماد التقرير' };
  }
}

export async function rejectProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await rejectProgressReport(id, { rejectionReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'فشل رفض التقرير' };
  }
}

export async function cancelProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await cancelProgressReport(id, { cancellationReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'فشل إلغاء التقرير' };
  }
}
