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
import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError, requireManager } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';

function handleActionError(error: unknown, fallbackMessage: string): { success: boolean; error: string } {
  if (error instanceof ValidationError) {
    return { success: false, error: 'بيانات غير صالحة' };
  }
  if (error instanceof AppError || error instanceof PermissionError || error instanceof AuthError) {
    return { success: false, error: error.message };
  }
  const msg = error instanceof Error ? error.message : fallbackMessage;
  return { success: false, error: msg };
}

export async function approveProgressReportAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    await approveProgressReport(id);
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, 'فشل اعتماد التقرير');
  }
}

export async function rejectProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    await rejectProgressReport(id, { rejectionReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, 'فشل رفض التقرير');
  }
}

export async function cancelProgressReportAction(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManager();
    await cancelProgressReport(id, { cancellationReason: reason });
    revalidatePath('/progress-reports');
    revalidatePath(`/progress-reports/${id}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, 'فشل إلغاء التقرير');
  }
}
