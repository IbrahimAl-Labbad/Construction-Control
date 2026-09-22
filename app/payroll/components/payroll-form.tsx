'use client';

/**
 * app/payroll/components/payroll-form.tsx
 *
 * Client Component — Form for creating or editing a PayrollEntry draft.
 * Supports:
 * - Active projects with approved budget and LABOR lines only.
 * - Plain text worker snapshots (no HR master).
 * - Numeric period year (2020..2050) & month (1..12 with Arabic names).
 * - Decimal string amount in SAR.
 * - Clear error feedback and duplicate click prevention.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type {
  PayrollDetailDTO,
  PayrollFormDataDTO,
  PayrollFormProject,
} from '@/lib/payroll/types';
import {
  createPayrollDraftAction,
  updatePayrollDraftAction,
} from '../actions';

interface PayrollFormProps {
  formData: PayrollFormDataDTO;
  existingPayroll?: PayrollDetailDTO;
}

const ARABIC_MONTHS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'يناير (01)' },
  { value: 2, label: 'فبراير (02)' },
  { value: 3, label: 'مارس (03)' },
  { value: 4, label: 'أبريل (04)' },
  { value: 5, label: 'مايو (05)' },
  { value: 6, label: 'يونيو (06)' },
  { value: 7, label: 'يوليو (07)' },
  { value: 8, label: 'أغسطس (08)' },
  { value: 9, label: 'سبتمبر (09)' },
  { value: 10, label: 'أكتوبر (10)' },
  { value: 11, label: 'نوفمبر (11)' },
  { value: 12, label: 'ديسمبر (12)' },
];

export function PayrollForm({ formData, existingPayroll }: PayrollFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(existingPayroll);

  // Form state
  const [projectId, setProjectId] = useState<string>(
    existingPayroll?.projectId ?? formData.projects[0]?.id ?? '',
  );
  const [budgetLineId, setBudgetLineId] = useState<string>(
    existingPayroll?.budgetLineId ??
      formData.projects.find((p) => p.id === (existingPayroll?.projectId ?? formData.projects[0]?.id))
        ?.laborLines[0]?.id ??
      '',
  );
  const [workerName, setWorkerName] = useState<string>(
    existingPayroll?.workerName ?? '',
  );
  const [workerReference, setWorkerReference] = useState<string>(
    existingPayroll?.workerReference ?? '',
  );
  const [tradeOrTitle, setTradeOrTitle] = useState<string>(
    existingPayroll?.tradeOrTitle ?? '',
  );
  const [periodYear, setPeriodYear] = useState<number>(
    existingPayroll?.periodYear ?? new Date().getFullYear(),
  );
  const [periodMonth, setPeriodMonth] = useState<number>(
    existingPayroll?.periodMonth ?? new Date().getMonth() + 1,
  );
  const [amount, setAmount] = useState<string>(existingPayroll?.amount ?? '');
  const [description, setDescription] = useState<string>(
    existingPayroll?.description ?? '',
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Derived current project and available labor budget lines
  const selectedProject: PayrollFormProject | undefined = formData.projects.find(
    (p) => p.id === projectId,
  );
  const availableLaborLines = selectedProject?.laborLines ?? [];

  // When project changes in create mode, default budgetLineId to first available labor line
  function handleProjectChange(newProjectId: string) {
    setProjectId(newProjectId);
    const proj = formData.projects.find((p) => p.id === newProjectId);
    const firstLine = proj?.laborLines[0];
    if (firstLine) {
      setBudgetLineId(firstLine.id);
    } else {
      setBudgetLineId('');
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    // Basic client checks
    if (!projectId) {
      setFormError('يرجى اختيار المشروع');
      return;
    }
    if (!budgetLineId) {
      setFormError('يرجى اختيار بند موازنة الأجور المعتمد');
      return;
    }
    if (!workerName.trim()) {
      setFieldErrors((prev) => ({ ...prev, workerName: 'اسم العامل مطلوب' }));
      return;
    }
    if (!amount.trim()) {
      setFieldErrors((prev) => ({ ...prev, amount: 'مبلغ الأجر مطلوب' }));
      return;
    }
    if (!description.trim()) {
      setFieldErrors((prev) => ({ ...prev, description: 'وصف قيد الراتب مطلوب' }));
      return;
    }

    startTransition(async () => {
      if (isEdit && existingPayroll) {
        const res = await updatePayrollDraftAction(existingPayroll.id, {
          projectId,
          budgetLineId,
          workerName: workerName.trim(),
          workerReference: workerReference.trim() || null,
          tradeOrTitle: tradeOrTitle.trim() || null,
          periodYear,
          periodMonth,
          amount: amount.trim(),
          description: description.trim(),
        });

        if (res.success) {
          setSuccessMessage('تم تحديث مسودة قيد الراتب بنجاح');
          router.push(`/payroll/${res.data.id}`);
        } else {
          setFormError(res.message);
          if (res.details && Array.isArray(res.details)) {
            const errs: Record<string, string> = {};
            for (const d of res.details) {
              errs[d.path] = d.message;
            }
            setFieldErrors(errs);
          }
        }
      } else {
        const res = await createPayrollDraftAction({
          projectId,
          budgetLineId,
          workerName: workerName.trim(),
          workerReference: workerReference.trim() || null,
          tradeOrTitle: tradeOrTitle.trim() || null,
          periodYear,
          periodMonth,
          amount: amount.trim(),
          currency: 'SAR',
          description: description.trim(),
        });

        if (res.success) {
          setSuccessMessage('تم إنشاء مسودة قيد الراتب بنجاح');
          router.push(`/payroll/${res.data.id}`);
        } else {
          setFormError(res.message);
          if (res.details && Array.isArray(res.details)) {
            const errs: Record<string, string> = {};
            for (const d of res.details) {
              errs[d.path] = d.message;
            }
            setFieldErrors(errs);
          }
        }
      }
    });
  }

  // Generate year options: 2020 through 2035
  const yearOptions: number[] = [];
  for (let y = 2020; y <= 2035; y++) {
    yearOptions.push(y);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="payroll-form">
      {formError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2"
          role="alert"
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      {successMessage && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
          role="status"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Project & BudgetLine selection */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Project Selector */}
        <div>
          <label
            htmlFor="projectId"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            المشروع <span className="text-destructive">*</span>
          </label>
          <select
            id="projectId"
            name="projectId"
            value={projectId}
            disabled={isPending || isEdit}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:opacity-75"
            data-testid="payroll-project-select"
          >
            {formData.projects.length === 0 ? (
              <option value="">لا توجد مشاريع نشطة بموازنة عمالة معتمدة</option>
            ) : (
              formData.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))
            )}
          </select>
          {fieldErrors['projectId'] && (
            <p className="text-xs text-destructive mt-1">{fieldErrors['projectId']}</p>
          )}
        </div>

        {/* LABOR Budget Line Selector */}
        <div>
          <label
            htmlFor="budgetLineId"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            بند موازنة الأجور والعمالة (LABOR) <span className="text-destructive">*</span>
          </label>
          <select
            id="budgetLineId"
            name="budgetLineId"
            value={budgetLineId}
            disabled={isPending || isEdit || availableLaborLines.length === 0}
            onChange={(e) => setBudgetLineId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:opacity-75"
            data-testid="payroll-budgetline-select"
          >
            {availableLaborLines.length === 0 ? (
              <option value="">لا توجد بنود أجور عمالة لهذا المشروع</option>
            ) : (
              availableLaborLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.description} (السقف المعتمد: {line.amount} ر.س)
                </option>
              ))
            )}
          </select>
          {fieldErrors['budgetLineId'] && (
            <p className="text-xs text-destructive mt-1">{fieldErrors['budgetLineId']}</p>
          )}
        </div>
      </div>

      {/* Worker Identification (Plain Text Snapshots) */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-4">
        <h3 className="text-sm font-bold text-foreground">بيانات العامل الميداني</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Worker Name */}
          <div>
            <label
              htmlFor="workerName"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              اسم العامل الكامل <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              id="workerName"
              name="workerName"
              value={workerName}
              disabled={isPending}
              onChange={(e) => setWorkerName(e.target.value)}
              placeholder="مثال: صالح محمد الغامدي"
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-worker-name-input"
            />
            {fieldErrors['workerName'] && (
              <p className="text-xs text-destructive mt-1">{fieldErrors['workerName']}</p>
            )}
          </div>

          {/* Worker Reference (Site Badge / ID) */}
          <div>
            <label
              htmlFor="workerReference"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              الرقم المرجعي / شارة الموقع (اختياري)
            </label>
            <input
              type="text"
              id="workerReference"
              name="workerReference"
              value={workerReference}
              disabled={isPending}
              onChange={(e) => setWorkerReference(e.target.value)}
              placeholder="مثال: WRK-042"
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-worker-ref-input"
            />
            {fieldErrors['workerReference'] && (
              <p className="text-xs text-destructive mt-1">{fieldErrors['workerReference']}</p>
            )}
          </div>

          {/* Trade or Title */}
          <div>
            <label
              htmlFor="tradeOrTitle"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              المهنة / المسمى الوظيفي (اختياري)
            </label>
            <input
              type="text"
              id="tradeOrTitle"
              name="tradeOrTitle"
              value={tradeOrTitle}
              disabled={isPending}
              onChange={(e) => setTradeOrTitle(e.target.value)}
              placeholder="مثال: فني تمديدات كهربائية"
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-trade-input"
            />
            {fieldErrors['tradeOrTitle'] && (
              <p className="text-xs text-destructive mt-1">{fieldErrors['tradeOrTitle']}</p>
            )}
          </div>
        </div>
      </div>

      {/* Period & Amount */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Period Year */}
        <div>
          <label
            htmlFor="periodYear"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            سنة الفترة <span className="text-destructive">*</span>
          </label>
          <select
            id="periodYear"
            name="periodYear"
            value={periodYear}
            disabled={isPending}
            onChange={(e) => setPeriodYear(parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="payroll-period-year-select"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          {fieldErrors['periodYear'] && (
            <p className="text-xs text-destructive mt-1">{fieldErrors['periodYear']}</p>
          )}
        </div>

        {/* Period Month */}
        <div>
          <label
            htmlFor="periodMonth"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            شهر الفترة <span className="text-destructive">*</span>
          </label>
          <select
            id="periodMonth"
            name="periodMonth"
            value={periodMonth}
            disabled={isPending}
            onChange={(e) => setPeriodMonth(parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="payroll-period-month-select"
          >
            {ARABIC_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {fieldErrors['periodMonth'] && (
            <p className="text-xs text-destructive mt-1">{fieldErrors['periodMonth']}</p>
          )}
        </div>

        {/* Monetary Amount */}
        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            مبلغ الأجر (ر.س) <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="amount"
            name="amount"
            value={amount}
            disabled={isPending}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثال: 4500.00"
            className="w-full rounded-lg border border-input bg-background p-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="payroll-amount-input"
          />
          {fieldErrors['amount'] && (
            <p className="text-xs text-destructive mt-1">{fieldErrors['amount']}</p>
          )}
        </div>
      </div>

      {/* Description / Site Notes */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-semibold text-foreground mb-1.5"
        >
          وصف قيد الأجر وملاحظات الموقع <span className="text-destructive">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          value={description}
          disabled={isPending}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="أدخل تفاصيل الأعمال والمهام أو ساعات العمل الإضافي المنجزة في الموقع..."
          className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="payroll-description-input"
        />
        {fieldErrors['description'] && (
          <p className="text-xs text-destructive mt-1">{fieldErrors['description']}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Link
          href={isEdit && existingPayroll ? `/payroll/${existingPayroll.id}` : '/payroll'}
          className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-muted transition-colors"
        >
          إلغاء
        </Link>
        <button
          type="submit"
          disabled={isPending || (formData.projects.length === 0 && !isEdit)}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          data-testid="submit-payroll-form-button"
        >
          {isPending
            ? 'جاري الحفظ...'
            : isEdit
            ? 'حفظ تعديلات المسودة'
            : 'حفظ كمسودة جديدة'}
        </button>
      </div>
    </form>
  );
}
