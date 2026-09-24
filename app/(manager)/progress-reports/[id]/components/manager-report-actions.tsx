'use client';

/**
 * app/(manager)/progress-reports/[id]/components/manager-report-actions.tsx
 *
 * Client action buttons for Manager report review:
 * - Approve submitted report
 * - Reject submitted report with dialog
 * - Cancel draft/submitted report with dialog
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RejectReportDialog, CancelReportDialog } from '@/components/progress-reports';
import {
  approveProgressReportAction,
  rejectProgressReportAction,
  cancelProgressReportAction,
} from '../../actions';
import { ProgressReportStatus } from '@prisma/client';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ManagerReportActionsProps {
  reportId: string;
  status: ProgressReportStatus;
}

export function ManagerReportActions({ reportId, status }: ManagerReportActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await approveProgressReportAction(reportId);
      if (!res.success) {
        setError(res.error ?? 'فشل اعتماد التقرير');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject(id: string, reason?: string) {
    const res = await rejectProgressReportAction(id, reason);
    if (res.success) {
      router.refresh();
    }
    return res;
  }

  async function handleCancel(id: string, reason?: string) {
    const res = await cancelProgressReportAction(id, reason);
    if (res.success) {
      router.refresh();
    }
    return res;
  }

  const canApproveOrReject = status === ProgressReportStatus.SUBMITTED;
  const canCancel =
    status === ProgressReportStatus.DRAFT || status === ProgressReportStatus.SUBMITTED;

  if (!canApproveOrReject && !canCancel) {
    return null;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canApproveOrReject && (
          <>
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              size="sm"
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="approve-report-button"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>{isSubmitting ? 'جاري الاعتماد...' : 'اعتماد التقرير'}</span>
            </Button>

            <RejectReportDialog reportId={reportId} onReject={handleReject} />
          </>
        )}

        {canCancel && (
          <CancelReportDialog reportId={reportId} onCancel={handleCancel} />
        )}
      </div>
    </div>
  );
}
