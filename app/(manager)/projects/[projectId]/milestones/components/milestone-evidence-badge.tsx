'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/milestone-evidence-badge.tsx
 *
 * Visual Evidence Status Badge for Project Milestones (CR-08 / BD-17).
 *
 * Implements authoritative brief §6.4:
 * - Green badge: "أدلة بصرية معتمدة (N صور مؤهلة)" when hasSufficientEvidence === true.
 * - Amber badge: "بانتظار اعتماد تقارير التقدم" when reports are linked but not yet approved.
 * - Amber/Warning badge: "بانتظار صور مؤهلة" when reports are approved but lack visual evidence.
 * - Red badge: "لا توجد أدلة بصرية معتمدة" when zero qualified photos exist.
 *
 * RTL & Arabic first, CSS logical properties.
 */

import { CheckCircle2, Clock, AlertTriangle, Image as ImageIcon } from 'lucide-react';

interface MilestoneEvidenceBadgeProps {
  milestone: {
    hasSufficientEvidence: boolean;
    linkedReportsCount: number;
    approvedReportsCount: number;
    visualAttachmentsCount: number;
    pendingReportsCount?: number;
    rejectedReportsCount?: number;
  };
  size?: 'sm' | 'md';
}

export function MilestoneEvidenceBadge({
  milestone,
  size = 'sm',
}: MilestoneEvidenceBadgeProps) {
  const {
    hasSufficientEvidence,
    approvedReportsCount,
    visualAttachmentsCount,
    pendingReportsCount = 0,
    rejectedReportsCount = 0,
  } = milestone;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSize = size === 'sm' ? 'size-3' : 'size-3.5';

  if (hasSufficientEvidence) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 ${sizeClasses}`}
        title={`تم استيفاء معايير الحوكمة: ${visualAttachmentsCount} صور مؤهلة من تقارير معتمدة`}
        data-testid="evidence-badge-sufficient"
      >
        <CheckCircle2 className={`${iconSize} shrink-0 text-emerald-600 dark:text-emerald-400`} aria-hidden="true" />
        <span>أدلة بصرية معتمدة ({visualAttachmentsCount} صور مؤهلة)</span>
      </span>
    );
  }

  // Genuinely pending reports awaiting approval
  if (pendingReportsCount > 0 && approvedReportsCount === 0) {
    const pendingTitle =
      rejectedReportsCount > 0
        ? `يوجد ${pendingReportsCount} تقرير مرتبط قيد الإعداد أو بانتظار الاعتماد (${rejectedReportsCount} تقرير مرفوض أو ملغى)`
        : `يوجد ${pendingReportsCount} تقرير مرتبط قيد الإعداد أو بانتظار الاعتماد`;

    return (
      <span
        className={`inline-flex items-center font-medium rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 ${sizeClasses}`}
        title={pendingTitle}
        data-testid="evidence-badge-pending"
      >
        <Clock className={`${iconSize} shrink-0 text-amber-600 dark:text-amber-400`} aria-hidden="true" />
        <span>بانتظار اعتماد تقارير التقدم</span>
      </span>
    );
  }

  if (approvedReportsCount > 0 && visualAttachmentsCount === 0) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 ${sizeClasses}`}
        title="توجد تقارير معتمدة ولكنها تفتقر إلى صور فوتوغرافية مؤهلة"
        data-testid="evidence-badge-missing-photos"
      >
        <ImageIcon className={`${iconSize} shrink-0 text-amber-600 dark:text-amber-400`} aria-hidden="true" />
        <span>بانتظار صور مؤهلة</span>
      </span>
    );
  }

  const noneTitle =
    rejectedReportsCount > 0
      ? `جميع تقارير التقدم المرتبطة (${rejectedReportsCount}) مرفوضة أو ملغاة (لا توجد تقارير بانتظار الاعتماد)`
      : 'لا توجد أي تقارير تقدم معتمدة مرفق بها صور لهذه المحطة';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 ${sizeClasses}`}
      title={noneTitle}
      data-testid="evidence-badge-none"
    >
      <AlertTriangle className={`${iconSize} shrink-0 text-rose-600 dark:text-rose-400`} aria-hidden="true" />
      <span>لا توجد أدلة بصرية معتمدة</span>
    </span>
  );
}

