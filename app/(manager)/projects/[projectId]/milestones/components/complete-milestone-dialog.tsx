'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/complete-milestone-dialog.tsx
 *
 * Evidence-Gated Completion Dialog for Project Milestones (CR-08 / BD-17).
 *
 * Implements authoritative brief §6.4:
 * - Displays milestone completion dialog showing linked reports and qualified photo previews.
 * - Displays explanatory alert when evidence criteria are unmet.
 * - Enforces client-side disabled state when evidence is insufficient, while server-side
 *   completeMilestone use case remains authoritative (Committed-Outcome Strategy).
 *
 * RTL & Arabic first, CSS logical properties.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Camera,
  FileText,
  Loader2,
  Calendar,
  User,
} from 'lucide-react';
import type { ProjectMilestoneDTO } from '@/lib/milestones';
import { MilestoneEvidenceBadge } from './milestone-evidence-badge';
import {
  completeMilestoneAction,
  getMilestoneEvidenceAction,
  type MilestoneEvidenceReportDTO,
} from '../actions';

interface CompleteMilestoneDialogProps {
  projectId: string;
  milestone: ProjectMilestoneDTO;
  disabled?: boolean;
}

export function CompleteMilestoneDialog({
  projectId,
  milestone,
  disabled = false,
}: CompleteMilestoneDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence preview state
  const [reports, setReports] = useState<MilestoneEvidenceReportDTO[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  function openDialog() {
    setError(null);
    setIsOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setIsOpen(false);
    dialogRef.current?.close();
  }

  // Load evidence details on dialog open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingEvidence(true);

    getMilestoneEvidenceAction(projectId, milestone.id).then((result) => {
      if (!isMounted) return;
      setIsLoadingEvidence(false);
      if (result.success) {
        setReports(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId, milestone.id]);

  async function handleComplete() {
    setIsSubmitting(true);
    setError(null);

    const result = await completeMilestoneAction(projectId, milestone.id);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || result.message);
      return;
    }

    closeDialog();
    router.refresh();
  }

  const {
    hasSufficientEvidence,
    linkedReportsCount,
    approvedReportsCount,
    visualAttachmentsCount,
    pendingReportsCount = 0,
  } = milestone;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title="إكمال المحطة"
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid={`complete-milestone-${milestone.id}`}
      >
        <CheckCircle className="size-3" aria-hidden="true" />
        <span>إنجاز</span>
      </button>

      <dialog
        ref={dialogRef}
        className="backdrop:bg-black/40 backdrop:backdrop-blur-sm rounded-xl p-0 shadow-2xl border border-slate-200 max-w-lg w-full bg-white text-slate-800"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 text-emerald-600 mb-4">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle className="size-6 text-emerald-600" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                إكمال المحطة التخطيطية
              </h3>
              <p className="text-xs text-slate-500">
                التحقق من استيفاء الأدلة البصرية والحوكمة (BD-17)
              </p>
            </div>
          </div>

          {/* Milestone Details Card */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1 mb-4">
            <div className="font-semibold text-slate-900 text-sm">
              {milestone.title}
            </div>
            {milestone.description && (
              <p className="text-slate-600 text-xs line-clamp-2">
                {milestone.description}
              </p>
            )}
            <div className="text-slate-500 flex flex-wrap items-center gap-4 pt-1">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3 text-slate-400" />
                <span>التاريخ المستهدف: <strong className="font-mono text-slate-700">{milestone.targetDate}</strong></span>
              </span>
              <span>
                الترتيب: <strong className="font-mono text-slate-700">#{milestone.orderIndex + 1}</strong>
              </span>
            </div>
          </div>

          {/* Evidence Metrics Summary */}
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                حالة الأدلة البصرية الميدانية:
              </span>
              <MilestoneEvidenceBadge milestone={milestone} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">التقارير المرتبطة</span>
                <span
                  className="font-bold font-mono text-slate-800 text-sm mt-0.5 block"
                  data-testid="evidence-linked-count"
                >
                  {linkedReportsCount}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">التقارير المعتمدة</span>
                <span
                  className="font-bold font-mono text-emerald-700 text-sm mt-0.5 block"
                  data-testid="evidence-approved-count"
                >
                  {approvedReportsCount}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">الصور المؤهلة</span>
                <span
                  className="font-bold font-mono text-blue-700 text-sm mt-0.5 block"
                  data-testid="evidence-visual-count"
                >
                  {visualAttachmentsCount}
                </span>
              </div>
            </div>
          </div>

          {/* Explanatory Alert */}
          {hasSufficientEvidence ? (
            <div
              className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 mb-4"
              data-testid="evidence-sufficient-alert"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-bold block">مستوفٍ لمعايير الأدلة البصرية (BD-17):</span>
                <span className="mt-0.5 block leading-relaxed text-emerald-700">
                  توجد تقارير تقدم معتمدة مرفق بها صور مؤهلة تثبت إنجاز الأعمال ميدانياً. يمكنك الآن اعتماد إكمال المحطة رسمياً.
                </span>
              </div>
            </div>
          ) : (
            <div
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 mb-4"
              data-testid="evidence-insufficient-alert"
            >
              <AlertTriangle className="size-4 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-bold block">معايير الإكمال غير مستوفاة:</span>
                <span className="mt-0.5 block leading-relaxed text-rose-700">
                  {linkedReportsCount === 0
                    ? 'لا توجد أي تقارير تقدم مرتبطة بهذه المحطة. يجب على مهندس الموقع ربط تقرير تقدم معتمد يحتوي على صور توثيقية للأعمال.'
                    : approvedReportsCount === 0 && pendingReportsCount === 0
                    ? 'جميع تقارير التقدم المرتبطة بهذه المحطة مرفوضة أو ملغاة. يتطلب إكمال المحطة ربط تقرير تقدم معتمد واحد على الأقل يحتوي على صور توثيقية.'
                    : approvedReportsCount === 0
                    ? 'توجد تقارير مرتبطة ولكنها لم تُعتمد بعد من قبل المدير. يتطلب إكمال المحطة اعتماد تقرير تقدم واحد على الأقل.'
                    : 'التقارير المعتمدة المرتبطة لا تحتوي على صور فوتوغرافية مؤهلة (JPEG/PNG/WebP في تصنيف صور التقدم أو أدلة التنفيذ).'}
                </span>
              </div>
            </div>
          )}

          {/* Linked Reports and Visual Evidence Previews */}
          <div className="space-y-2 mb-4">
            <span className="text-xs font-semibold text-slate-700 block">
              تفاصيل التقارير والصور المرفقة:
            </span>

            {isLoadingEvidence ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin text-slate-400" />
                <span>جاري تحميل بيانات الأدلة البصرية...</span>
              </div>
            ) : reports.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                لا توجد تقارير تقدم مرتبطة بهذه المحطة حتى الآن.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 pe-1">
                {reports.map((report) => {
                  const isApproved = report.status === 'APPROVED';
                  const photoCount = report.attachments.length;

                  return (
                    <div
                      key={report.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2"
                      data-testid={`linked-report-item-${report.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          <FileText className="size-3.5 text-primary" />
                          <span>{report.title}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {isApproved ? 'معتمد' : report.status === 'SUBMITTED' ? 'قيد المراجعة' : 'مسودة'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          <span>{report.reportDate}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          <span>{report.authorName}</span>
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-blue-700">
                          <Camera className="size-3" />
                          <span>{photoCount} صور مؤهلة</span>
                        </span>
                      </div>

                      {/* Photo chips preview */}
                      {photoCount > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200">
                          {report.attachments.map((att) => (
                            <span
                              key={att.id}
                              className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[10px] text-slate-700"
                              title={`${att.originalFileName} (${(att.sizeBytes / 1024).toFixed(0)} KB)`}
                            >
                              <Camera className="size-2.5 text-slate-400" />
                              <span className="truncate max-w-[120px]">{att.originalFileName}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Error Banner */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 mb-4">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={closeDialog}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={isSubmitting || !hasSufficientEvidence}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              data-testid="confirm-complete-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>جاري الاعتماد...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" />
                  <span>تأكيد إكمال المحطة</span>
                </>
              )}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
