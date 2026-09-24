'use client';

/**
 * app/(engineer)/my-reports/[id]/components/engineer-report-actions.tsx
 *
 * Client action buttons for Engineer report detail view:
 * - Submit draft for review
 * - Reopen rejected report to draft
 * - Cancel draft report
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CancelReportDialog } from '@/components/progress-reports';
import {
  submitProgressReportAction,
  reopenProgressReportAction,
  cancelProgressReportAction,
} from '../../actions';
import { ProgressReportStatus } from '@prisma/client';
import { Send, Pencil, RotateCcw, AlertCircle } from 'lucide-react';

interface EngineerReportActionsProps {
  reportId: string;
  status: ProgressReportStatus;
}

export function EngineerReportActions({ reportId, status }: EngineerReportActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await submitProgressReportAction(reportId);
      if (!res.success) {
        setError(res.error ?? 'فشل تقديم التقرير');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReopen() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await reopenProgressReportAction(reportId);
      if (!res.success) {
        setError(res.error ?? 'فشل إعادة فتح التقرير');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: string, reason?: string) {
    const res = await cancelProgressReportAction(id, reason);
    if (res.success) {
      router.refresh();
    }
    return res;
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
        {status === ProgressReportStatus.DRAFT && (
          <>
            <Link
              href={`/my-reports/${reportId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted"
              data-testid="edit-draft-link"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              <span>تعديل المسودة</span>
            </Link>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              size="sm"
              className="flex items-center gap-1.5"
              data-testid="submit-report-button"
            >
              <Send className="size-3.5" aria-hidden="true" />
              <span>{isSubmitting ? 'جاري التقديم...' : 'تقديم للمراجعة'}</span>
            </Button>

            <CancelReportDialog reportId={reportId} onCancel={handleCancel} />
          </>
        )}

        {status === ProgressReportStatus.REJECTED && (
          <Button
            onClick={handleReopen}
            disabled={isSubmitting}
            size="sm"
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="reopen-report-button"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>{isSubmitting ? 'جاري إعادة الفتح...' : 'إعادة فتح كمسودة للتعديل'}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
