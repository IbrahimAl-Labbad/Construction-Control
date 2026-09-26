'use client';

/**
 * app/(manager)/projects/[projectId]/milestones/components/milestone-table.tsx
 *
 * Interactive data table for project milestones.
 * Features:
 * - Status badges + overdue indicator
 * - Target date display + BD-12-15 visual warning if outside project range
 * - Achieved date display
 * - Reorder controls (up/down) with optimistic/server action call
 * - Lifecycle action triggers: Start, Complete, Edit, Cancel, Soft Delete
 * - Strict role and frozen project checks
 *
 * Vertical Slice 12 — Project Planning & Milestones.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  ArrowDown,
  Play,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Flag,
  Calendar,
  Lock,
} from 'lucide-react';
import type { ProjectMilestoneDTO } from '@/lib/milestones';
import { MilestoneStatusBadge } from './milestone-status-badge';
import { EditMilestoneDialog } from './edit-milestone-dialog';
import { CancelMilestoneDialog } from './cancel-milestone-dialog';
import {
  startMilestoneAction,
  completeMilestoneAction,
  deleteMilestoneAction,
  reorderMilestonesAction,
} from '../actions';

interface MilestoneTableProps {
  projectId: string;
  milestones: ProjectMilestoneDTO[];
  canManage: boolean;
  isProjectFrozen: boolean;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
}

export function MilestoneTable({
  projectId,
  milestones,
  canManage,
  isProjectFrozen,
  projectStartDate,
  projectEndDate,
}: MilestoneTableProps) {
  const router = useRouter();
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Soft delete confirmation dialog state
  const [deleteConfirmMilestone, setDeleteConfirmMilestone] =
    useState<ProjectMilestoneDTO | null>(null);

  const canMutate = canManage && !isProjectFrozen;

  // Format calendar date
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-').map(Number);
      const year = parts[0] ?? 2000;
      const month = parts[1] ?? 1;
      const day = parts[2] ?? 1;
      return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(year, month - 1, day));
    } catch {
      return dateStr;
    }
  }

  // Format ISO timestamp
  function formatTimestamp(isoStr: string | null): string {
    if (!isoStr) return '—';
    try {
      return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(isoStr));
    } catch {
      return isoStr;
    }
  }

  // BD-12-15 date range boundary check (Visual warning only)
  function getDateWarning(targetDate: string): string | null {
    if (projectStartDate && targetDate < projectStartDate) {
      return 'التاريخ يسبق تاريخ بدء المشروع';
    }
    if (projectEndDate && targetDate > projectEndDate) {
      return 'التاريخ يتجاوز تاريخ انتهاء المشروع';
    }
    return null;
  }

  // Handle Start
  async function handleStart(milestoneId: string) {
    setBusyMilestoneId(milestoneId);
    setActionError(null);
    const result = await startMilestoneAction(projectId, milestoneId);
    setBusyMilestoneId(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  // Handle Complete
  async function handleComplete(milestoneId: string) {
    setBusyMilestoneId(milestoneId);
    setActionError(null);
    const result = await completeMilestoneAction(projectId, milestoneId);
    setBusyMilestoneId(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  // Handle Delete (PLANNED only)
  async function handleDeleteConfirm() {
    if (!deleteConfirmMilestone) return;
    setBusyMilestoneId(deleteConfirmMilestone.id);
    setActionError(null);
    const result = await deleteMilestoneAction(projectId, deleteConfirmMilestone.id);
    setBusyMilestoneId(null);
    setDeleteConfirmMilestone(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  // Handle Reorder Up
  async function handleMoveUp(index: number) {
    if (index === 0 || !canMutate) return;
    const currentItem = milestones[index];
    const prevItem = milestones[index - 1];
    if (!currentItem || !prevItem) return;

    const items = [...milestones];
    items[index - 1] = currentItem;
    items[index] = prevItem;

    const orderedIds = items.map((m) => m.id);
    setBusyMilestoneId(currentItem.id);
    setActionError(null);
    const result = await reorderMilestonesAction(projectId, orderedIds);
    setBusyMilestoneId(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  // Handle Reorder Down
  async function handleMoveDown(index: number) {
    if (index === milestones.length - 1 || !canMutate) return;
    const currentItem = milestones[index];
    const nextItem = milestones[index + 1];
    if (!currentItem || !nextItem) return;

    const items = [...milestones];
    items[index + 1] = currentItem;
    items[index] = nextItem;

    const orderedIds = items.map((m) => m.id);
    setBusyMilestoneId(currentItem.id);
    setActionError(null);
    const result = await reorderMilestonesAction(projectId, orderedIds);
    setBusyMilestoneId(null);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {isProjectFrozen && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <Lock className="size-4 shrink-0 text-amber-600" />
          <span>
            المشروع في حالة تجميد (معلق أو مكتمل أو ملغى). تم إيقاف جميع العمليات
            والتعديلات على المعالم وفق ضوابط الحوكمة.
          </span>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Flag className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            لا توجد معالم مسجلة لهذا المشروع
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            لم يتم إنشاء أي معالم رئيسية أو تعاقدية بعد. يمكنك إضافة المعلم الأول
            لبدء متابعة المخطط الزمني للمشروع.
          </p>
        </div>
      ) : (

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              {canMutate && <th className="px-3 py-3 text-center w-16">الترتيب</th>}
              <th className="px-4 py-3 text-start">عنوان المعلم والوصف</th>
              <th className="px-3 py-3 text-start w-32">الحالة</th>
              <th className="px-4 py-3 text-start w-40">التاريخ المستهدف</th>
              <th className="px-4 py-3 text-start w-40">تاريخ الإنجاز الفعلي</th>
              <th className="px-3 py-3 text-start w-32">المنشئ</th>
              <th className="px-4 py-3 text-center w-52">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {milestones.map((m, index) => {
              const warning = getDateWarning(m.targetDate);
              const isBusy = busyMilestoneId === m.id;
              const isTerminal = m.status === 'COMPLETED' || m.status === 'CANCELLED';

              return (
                <tr
                  key={m.id}
                  className="hover:bg-muted/20 transition-colors"
                  data-testid={`milestone-row-${m.id}`}
                >
                  {/* Reorder Buttons */}
                  {canMutate && (
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0 || isBusy}
                          title="نقل لأعلى"
                          aria-label="نقل لأعلى"
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <span className="font-mono text-xs text-muted-foreground min-w-[1.2rem] text-center">
                          {m.orderIndex + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === milestones.length - 1 || isBusy}
                          title="نقل لأسفل"
                          aria-label="نقل لأسفل"
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Title & Description */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span
                        className={`font-semibold text-foreground ${
                          m.status === 'CANCELLED' ? 'line-through text-muted-foreground' : ''
                        }`}
                        data-testid="milestone-title"
                      >
                        {m.title}
                      </span>
                      {m.description && (
                        <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                          {m.description}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <MilestoneStatusBadge
                      status={m.status}
                      isOverdue={m.isOverdue}
                    />
                  </td>

                  {/* Target Date + BD-12-15 warning */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className="font-mono text-xs text-foreground inline-flex items-center gap-1"
                        data-testid="milestone-target-date"
                      >
                        <Calendar className="size-3.5 text-muted-foreground" />
                        <span>{m.targetDate}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(m.targetDate)}
                      </span>
                      {warning && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-0.5"
                          title={warning}
                          data-testid="target-date-range-warning"
                        >
                          <AlertTriangle className="size-3 shrink-0" />
                          <span>{warning}</span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Achieved Date */}
                  <td className="px-4 py-3">
                    {m.achievedAt ? (
                      <div className="flex flex-col text-xs text-emerald-700 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle className="size-3.5 text-emerald-600" />
                          <span>{formatTimestamp(m.achievedAt)}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Creator */}
                  <td className="px-3 py-3">
                    <span className="text-xs text-muted-foreground">
                      {m.creatorName}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-center">
                    {!canMutate ? (
                      <span className="text-xs text-muted-foreground italic">
                        {isProjectFrozen ? 'مشروع مجمد' : 'عرض فقط'}
                      </span>
                    ) : isTerminal ? (
                      <span className="text-xs text-muted-foreground italic">
                        حالة نهائية
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {/* Start (PLANNED only) */}
                        {m.status === 'PLANNED' && (
                          <button
                            type="button"
                            onClick={() => handleStart(m.id)}
                            disabled={isBusy}
                            title="بدء المعلم"
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 transition-colors disabled:opacity-50"
                            data-testid={`start-milestone-${m.id}`}
                          >
                            <Play className="size-3" />
                            <span>بدء</span>
                          </button>
                        )}

                        {/* Complete (PLANNED or IN_PROGRESS) */}
                        <button
                          type="button"
                          onClick={() => handleComplete(m.id)}
                          disabled={isBusy}
                          title="إنجاز المعلم"
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors disabled:opacity-50"
                          data-testid={`complete-milestone-${m.id}`}
                        >
                          <CheckCircle className="size-3" />
                          <span>إنجاز</span>
                        </button>

                        {/* Edit metadata */}
                        <EditMilestoneDialog
                          projectId={projectId}
                          milestone={m}
                        />

                        {/* Cancel */}
                        <CancelMilestoneDialog
                          projectId={projectId}
                          milestone={m}
                          disabled={isBusy}
                        />

                        {/* Soft Delete (PLANNED only) */}
                        {m.status === 'PLANNED' && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmMilestone(m)}
                            disabled={isBusy}
                            title="حذف المعلم (مسودة)"
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors disabled:opacity-50"
                            data-testid={`delete-milestone-${m.id}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      {deleteConfirmMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-slate-800 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-lg">
                <Trash2 className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  حذف المعلم المخطط
                </h3>
                <p className="text-xs text-slate-500">
                  إزالة المعلم من قائمة التخطيط
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف المعلم:{' '}
              <strong className="text-slate-900">
                «{deleteConfirmMilestone.title}»
              </strong>
              ؟ هذا الإجراء مسموح فقط للمعالم المخططة (PLANNED) ويتم تسجيله في سجل
              التدقيق.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmMilestone(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={busyMilestoneId === deleteConfirmMilestone.id}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                data-testid="confirm-delete-button"
              >
                {busyMilestoneId === deleteConfirmMilestone.id
                  ? 'جاري الحذف...'
                  : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
