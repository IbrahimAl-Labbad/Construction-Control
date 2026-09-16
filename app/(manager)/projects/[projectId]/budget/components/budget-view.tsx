'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Send,
  RotateCcw,
  ShieldCheck,
  FileText,
  DollarSign,
  Info,
} from 'lucide-react';

import type { BudgetCategory, BudgetDetailsDTO } from '@/lib/budget';
import { BudgetStatusBadge } from './budget-status-badge';
import {
  BUDGET_CATEGORY_LABELS,
  getBudgetCategoryLabel,
} from './budget-category-label';
import {
  createBudgetDraftAction,
  updateBudgetDraftAction,
  submitBudgetAction,
  approveBudgetAction,
  rejectBudgetAction,
  reopenBudgetDraftAction,
} from '../actions';

interface BudgetViewProps {
  projectId: string;
  initialBudget: BudgetDetailsDTO | null;
  projectStatus: string;
}

interface DraftLineItem {
  id?: string;
  category: BudgetCategory;
  description: string;
  amount: string;
}

export function BudgetView({
  projectId,
  initialBudget,
  projectStatus,
}: BudgetViewProps) {
  const router = useRouter();

  // Local state
  const [budget, setBudget] = useState<BudgetDetailsDTO | null>(initialBudget);

  // Form lines for drafting/editing
  const [lines, setLines] = useState<DraftLineItem[]>(() => {
    if (initialBudget && initialBudget.lines.length > 0) {
      return initialBudget.lines.map((l) => ({
        id: l.id,
        category: l.category,
        description: l.description,
        amount: l.amount,
      }));
    }
    return [
      {
        category: 'MATERIALS',
        description: '',
        amount: '',
      },
    ];
  });

  const [notes, setNotes] = useState(initialBudget?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Calculate client-side running sum for feedback only
  const clientComputedTotal = lines.reduce((acc, line) => {
    const num = parseFloat(line.amount);
    return acc + (isNaN(num) || num < 0 ? 0 : num);
  }, 0);

  function handleAddLine() {
    setLines((prev) => [
      ...prev,
      {
        category: 'MATERIALS',
        description: '',
        amount: '',
      },
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) {
      setError('يجب أن تحتوي الموازنة على بند واحد على الأقل');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLineChange(
    index: number,
    field: keyof DraftLineItem,
    value: string,
  ) {
    setLines((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (!current) return copy;
      const updated: DraftLineItem = {
        category: field === 'category' ? (value as BudgetCategory) : current.category,
        description: field === 'description' ? value : current.description,
        amount: field === 'amount' ? value : current.amount,
      };
      if (current.id !== undefined) {
        updated.id = current.id;
      }
      copy[index] = updated;
      return copy;
    });
    setError(null);
    setFieldErrors({});
  }

  // --- Actions ---

  async function handleSaveDraft() {
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (!budget) {
        // Create initial draft
        const res = await createBudgetDraftAction(projectId, {
          notes,
          lines,
        });

        if (!res.success) {
          setError(res.message);
          if (res.details) {
            const errs: Record<string, string> = {};
            res.details.forEach((d) => (errs[d.path] = d.message));
            setFieldErrors(errs);
          }
          return;
        }

        setBudget(res.data);
        router.refresh();
      } else {
        // Update existing draft
        const res = await updateBudgetDraftAction(projectId, budget.id, {
          notes,
          lines,
        });

        if (!res.success) {
          setError(res.message);
          if (res.details) {
            const errs: Record<string, string> = {};
            res.details.forEach((d) => (errs[d.path] = d.message));
            setFieldErrors(errs);
          }
          return;
        }

        setBudget(res.data);
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!budget) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await submitBudgetAction(projectId, budget.id);
      if (!res.success) {
        setError(res.message);
        return;
      }
      setBudget(res.data);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!budget) return;
    if (!confirm('هل أنت متأكد من رغبتك في اعتماد الموازنة نهائياً؟ بمجرد الاعتماد تصبح الموازنة غير قابلة للتعديل.')) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await approveBudgetAction(projectId, budget.id);
      if (!res.success) {
        setError(res.message);
        return;
      }
      setBudget(res.data);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRejectSubmit() {
    if (!budget) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setError('يرجى ذكر سبب الرفض (3 أحرف على الأقل)');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await rejectBudgetAction(projectId, budget.id, {
        rejectionReason,
      });

      if (!res.success) {
        setError(res.message);
        return;
      }

      setBudget(res.data);
      setShowRejectModal(false);
      setRejectionReason('');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReopen() {
    if (!budget) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await reopenBudgetDraftAction(projectId, budget.id);
      if (!res.success) {
        setError(res.message);
        return;
      }

      setBudget(res.data);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const isProjectClosed =
    projectStatus === 'COMPLETED' || projectStatus === 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Error notification banner */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          data-testid="budget-error-alert"
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Top Status & Summary Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  الموازنة التقديرية للمشروع
                </h2>
                {budget && <BudgetStatusBadge status={budget.status} />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {budget
                  ? `الإصدار ${budget.version} • العملة: ${budget.currency}`
                  : 'خط الأساس المالي للرقابة على المصروفات'}
              </p>
            </div>
          </div>

          {/* Display Total Amount */}
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs font-medium text-muted-foreground">
              {budget?.status === 'APPROVED'
                ? 'إجمالي الموازنة المعتمدة'
                : 'الإجمالي التقديري المحسوب'}
            </span>
            <span
              className="text-2xl font-bold font-mono text-primary"
              data-testid="budget-total-amount"
            >
              {budget
                ? `${budget.totalAmount} ر.س`
                : `${clientComputedTotal.toFixed(2)} ر.س`}
            </span>
          </div>
        </div>

        {/* Informational banners per status */}
        {budget?.status === 'APPROVED' && (
          <div
            className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-800 dark:text-emerald-300"
            data-testid="budget-approved-banner"
          >
            <ShieldCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">الموازنة معتمدة ومحصنة ضد التعديل</p>
              <p className="text-xs mt-0.5 opacity-90">
                اعتمدها المدير {budget.approvedBy?.name || 'المدير'} بتاريخ{' '}
                {budget.approvedAt
                  ? new Intl.DateTimeFormat('ar-SA', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(budget.approvedAt))
                  : 'غير محدد'}
                . تشكل هذه الموازنة خط الأساس الرقابي للمصروفات وأوامر الشراء.
              </p>
            </div>
          </div>
        )}

        {budget?.status === 'SUBMITTED' && (
          <div
            className="mt-4 flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3.5 text-sm text-blue-800 dark:text-blue-300"
            data-testid="budget-submitted-banner"
          >
            <Info className="size-5 shrink-0 text-blue-600" aria-hidden="true" />
            <p>
              تم تقديم هذه الموازنة للاعتماد الرسمي. يمكن للمدير الآن اعتمادها كخط
              أساس للمشروع أو رفضها مع إبداء الأسباب.
            </p>
          </div>
        )}

        {budget?.status === 'REJECTED' && (
          <div
            className="mt-4 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="budget-rejected-banner"
          >
            <div className="flex items-center gap-2 font-semibold">
              <XCircle className="size-5 shrink-0" aria-hidden="true" />
              <span>تم رفض مسودة الموازنة من قبل المدير</span>
            </div>
            <div className="bg-background/80 rounded-md p-3 text-xs text-foreground border border-destructive/20">
              <span className="font-semibold text-destructive">سبب الرفض: </span>
              {budget.rejectionReason || 'لم يتم تسجيل سبب محدد.'}
            </div>
            <p className="text-xs text-muted-foreground">
              يمكنك النقر على زر &quot;إعادة فتح المسودة&quot; أدناه لمعالجة الملاحظات
              وإعادة التقديم.
            </p>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {budget?.createdBy && (
              <span>أنشأها: {budget.createdBy.name}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* DRAFT Actions */}
            {(!budget || budget.status === 'DRAFT') && !isProjectClosed && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:opacity-50"
                  data-testid="save-budget-draft-button"
                >
                  <Save className="size-4" aria-hidden="true" />
                  <span>{budget ? 'حفظ تعديلات المسودة' : 'إنشاء المسودة'}</span>
                </button>

                {budget && (
                  <button
                    type="button"
                    onClick={handleSubmitForApproval}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                    data-testid="submit-budget-button"
                  >
                    <Send className="size-4" aria-hidden="true" />
                    <span>تقديم للاعتماد</span>
                  </button>
                )}
              </>
            )}

            {/* SUBMITTED Actions (Manager Approval & Rejection) */}
            {budget?.status === 'SUBMITTED' && !isProjectClosed && (
              <>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="approve-budget-button"
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  <span>اعتماد الموازنة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-4 py-2 text-sm font-medium text-destructive shadow-sm hover:bg-destructive/10 disabled:opacity-50"
                  data-testid="reject-budget-button"
                >
                  <XCircle className="size-4" aria-hidden="true" />
                  <span>رفض الموازنة</span>
                </button>
              </>
            )}

            {/* REJECTED Action (Reopen) */}
            {budget?.status === 'REJECTED' && !isProjectClosed && (
              <button
                type="button"
                onClick={handleReopen}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                data-testid="reopen-budget-button"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                <span>إعادة فتح المسودة للتعديل</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              رفض مسودة الموازنة
            </h3>
            <p className="text-xs text-muted-foreground">
              يرجى توضيح أسباب رفض الموازنة حتى يتمكن المعد من مراجعتها وتعديلها.
            </p>
            <div>
              <label
                htmlFor="rejectionReason"
                className="block text-xs font-medium text-foreground mb-1"
              >
                سبب الرفض <span className="text-destructive">*</span>
              </label>
              <textarea
                id="rejectionReason"
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="مثال: مبالغ بند العمالة مبالغ فيها مقارنة بالمخطط الزمني..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="rejection-reason-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRejectSubmit}
                disabled={isSubmitting || !rejectionReason.trim()}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                data-testid="confirm-reject-button"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Lines Table / Form */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:px-6 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-base font-semibold text-foreground">
              بنود التكلفة المعتمدة ({lines.length})
            </h3>
          </div>

          {/* Add Line Button only when in editable DRAFT mode */}
          {(!budget || budget.status === 'DRAFT') && !isProjectClosed && (
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
              data-testid="add-budget-line-button"
            >
              <Plus className="size-3.5 text-primary" aria-hidden="true" />
              <span>إضافة بند تكلفة</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-6 w-12">#</th>
                <th scope="col" className="px-4 py-3 sm:px-6 w-52">التصنيف</th>
                <th scope="col" className="px-4 py-3 sm:px-6">وصف وتفاصيل البند</th>
                <th scope="col" className="px-4 py-3 sm:px-6 w-44">المبلغ المخصص (ر.س)</th>
                {(!budget || budget.status === 'DRAFT') && !isProjectClosed && (
                  <th scope="col" className="px-4 py-3 sm:px-6 w-16 text-center">إجراء</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line, index) => {
                const isDraftMode =
                  (!budget || budget.status === 'DRAFT') && !isProjectClosed;

                return (
                  <tr key={index} className="hover:bg-muted/30 transition-colors" data-testid={`budget-line-row-${index}`}>
                    <td className="px-4 py-3 sm:px-6 font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 sm:px-6">
                      {isDraftMode ? (
                        <select
                          value={line.category}
                          onChange={(e) =>
                            handleLineChange(
                              index,
                              'category',
                              e.target.value as BudgetCategory,
                            )
                          }
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          data-testid={`budget-line-category-${index}`}
                        >
                          {Object.entries(BUDGET_CATEGORY_LABELS).map(
                            ([catKey, catLabel]) => (
                              <option key={catKey} value={catKey}>
                                {catLabel}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <span className="inline-flex rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground border border-border">
                          {getBudgetCategoryLabel(line.category)}
                        </span>
                      )}
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3 sm:px-6">
                      {isDraftMode ? (
                        <div>
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) =>
                              handleLineChange(index, 'description', e.target.value)
                            }
                            placeholder="مثال: توريد حديد تسليح سابك 16مم..."
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`budget-line-description-${index}`}
                          />
                          {fieldErrors[`lines.${index}.description`] && (
                            <p className="mt-1 text-[11px] text-destructive">
                              {fieldErrors[`lines.${index}.description`]}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground leading-relaxed">
                          {line.description}
                        </span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 sm:px-6">
                      {isDraftMode ? (
                        <div>
                          <input
                            type="text"
                            value={line.amount}
                            onChange={(e) =>
                              handleLineChange(index, 'amount', e.target.value)
                            }
                            placeholder="0.00"
                            className="w-full font-mono text-left rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            dir="ltr"
                            data-testid={`budget-line-amount-${index}`}
                          />
                          {fieldErrors[`lines.${index}.amount`] && (
                            <p className="mt-1 text-[11px] text-destructive">
                              {fieldErrors[`lines.${index}.amount`]}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-foreground" dir="ltr">
                          {line.amount}
                        </span>
                      )}
                    </td>

                    {/* Delete action in draft mode */}
                    {isDraftMode && (
                      <td className="px-4 py-3 sm:px-6 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="حذف البند"
                          data-testid={`remove-budget-line-${index}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40 font-semibold text-xs text-foreground">
              <tr>
                <td colSpan={3} className="px-4 py-3 sm:px-6 text-start">
                  الإجمالي الكلي للموازنة
                </td>
                <td className="px-4 py-3 sm:px-6 font-mono text-primary text-sm font-bold" dir="ltr">
                  {budget ? budget.totalAmount : clientComputedTotal.toFixed(2)} ر.س
                </td>
                {(!budget || budget.status === 'DRAFT') && !isProjectClosed && (
                  <td></td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes input / display */}
        <div className="p-4 sm:p-6 border-t border-border bg-muted/10 space-y-2">
          <label
            htmlFor="budgetNotes"
            className="block text-xs font-semibold text-foreground"
          >
            ملاحظات وتوجيهات إدارية
          </label>
          {(!budget || budget.status === 'DRAFT') && !isProjectClosed ? (
            <textarea
              id="budgetNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات أو شروط خاصة بصرف بنود هذه الموازنة..."
              className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="budget-notes-input"
            />
          ) : (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {budget?.notes || 'لا توجد ملاحظات إدارية مسجلة.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
