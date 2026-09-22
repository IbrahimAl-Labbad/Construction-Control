'use client';

/**
 * app/subcontractor-billings/components/billing-form.tsx
 *
 * Arabic RTL form for creating or editing a SubcontractorBilling draft.
 *
 * Field order (per spec §8.3):
 *   1. Project selector
 *   2. Approved Commitment selector
 *   3. Subcontractor Name (read-only — derived from commitment.vendorName)
 *   4. Reference Number
 *   5. Billing Period
 *   6. Claim Date
 *   7. Gross Amount
 *   8. Description
 *
 * Decisions enforced:
 * - Only APPROVED commitments are shown (backend also enforces this).
 * - subcontractorName is READ-ONLY; derived from commitment.vendorName (Decision #24).
 * - projectId, commitmentId, budgetLineId are immutable during edit.
 * - No floating-point arithmetic for amounts — string passed directly to server.
 * - Server remains authoritative for all validation.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type {
  BillingFormDataDTO,
  BillingFormCommitment,
  BillingFormProject,
} from '@/lib/subcontractor-billings/queries/get-billing-form-data';
import type { SubcontractorBillingSummaryDTO } from '@/lib/subcontractor-billings/types';
import { createBillingDraftAction, updateBillingDraftAction } from '../actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BillingFormProps {
  formData: BillingFormDataDTO;
  /** When provided, the form is in EDIT mode for this existing draft. */
  existingBilling?: SubcontractorBillingSummaryDTO;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingForm({ formData, existingBilling }: BillingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(existingBilling);

  // Immutable in edit mode: projectId, commitmentId, budgetLineId
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    existingBilling?.projectId ?? formData.projects[0]?.id ?? '',
  );

  const currentProject: BillingFormProject | undefined = formData.projects.find(
    (p) => p.id === selectedProjectId,
  );

  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string>(
    existingBilling?.commitmentId ?? currentProject?.approvedCommitments[0]?.id ?? '',
  );

  const selectedCommitment: BillingFormCommitment | undefined =
    (currentProject?.approvedCommitments ?? []).find((c) => c.id === selectedCommitmentId);

  // Derived from commitment — read-only per Decision #24
  const subcontractorName = selectedCommitment?.vendorName ?? '';

  const [referenceNumber, setReferenceNumber] = useState<string>(
    existingBilling?.referenceNumber ?? '',
  );
  const [billingPeriod, setBillingPeriod] = useState<string>(
    existingBilling?.billingPeriod ?? '',
  );
  const [claimDate, setClaimDate] = useState<string>(
    existingBilling
      ? new Date(existingBilling.claimDate).toISOString().split('T')[0] ?? todayISO()
      : todayISO(),
  );
  const [grossAmount, setGrossAmount] = useState<string>(
    existingBilling?.grossAmount ?? '',
  );
  const [description, setDescription] = useState<string>(
    existingBilling?.description ?? '',
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Update commitment when project changes (create mode only)
  function handleProjectChange(projectId: string) {
    if (isEdit) return; // immutable in edit
    setSelectedProjectId(projectId);
    const proj = formData.projects.find((p) => p.id === projectId);
    setSelectedCommitmentId(proj?.approvedCommitments[0]?.id ?? '');
    setFieldErrors({});
    setFormError(null);
  }

  function handleCommitmentChange(commitmentId: string) {
    if (isEdit) return; // immutable in edit
    setSelectedCommitmentId(commitmentId);
    setFieldErrors({});
    setFormError(null);
  }

  // Client-side pre-validation to provide quick feedback (server is authoritative)
  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!selectedProjectId) errors.projectId = 'يرجى اختيار المشروع';
    if (!selectedCommitmentId) errors.commitmentId = 'يرجى اختيار الالتزام';
    if (!billingPeriod.trim() || billingPeriod.trim().length < 2)
      errors.billingPeriod = 'فترة المستخلص يجب أن تتكون من حرفين على الأقل';
    if (!claimDate) errors.claimDate = 'يرجى إدخال تاريخ المطالبة';
    if (!grossAmount.trim() || isNaN(parseFloat(grossAmount)) || parseFloat(grossAmount) <= 0)
      errors.grossAmount = 'المبلغ الإجمالي يجب أن يكون رقماً موجباً أكبر من صفر';
    if (!description.trim() || description.trim().length < 3)
      errors.description = 'الوصف يجب أن يتكون من 3 أحرف على الأقل';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!validate()) return;

    startTransition(async () => {
      const budgetLineId =
        existingBilling?.budgetLineId ?? selectedCommitment?.budgetLineId ?? '';

      const payload = {
        subcontractorName: subcontractorName.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        billingPeriod: billingPeriod.trim(),
        claimDate: new Date(claimDate) as unknown as Date,
        grossAmount: grossAmount.trim(),
        description: description.trim(),
      };

      if (isEdit && existingBilling) {
        // Edit mode: projectId, commitmentId, budgetLineId are immutable
        const result = await updateBillingDraftAction(existingBilling.id, payload);
        if (!result.success) {
          setFormError(result.message);
          if (result.details) {
            const errs: Record<string, string> = {};
            result.details.forEach((d) => {
              errs[d.path] = d.message;
            });
            setFieldErrors(errs);
          }
          return;
        }
        setSuccessMessage('تم حفظ التعديلات بنجاح');
        router.push(`/subcontractor-billings/${existingBilling.id}`);
      } else {
        // Create mode
        const result = await createBillingDraftAction({
          projectId: selectedProjectId,
          budgetLineId,
          commitmentId: selectedCommitmentId,
          subcontractorName: subcontractorName.trim(),
          referenceNumber: referenceNumber.trim() || undefined,
          billingPeriod: billingPeriod.trim(),
          claimDate: new Date(claimDate) as unknown as Date,
          grossAmount: grossAmount.trim(),
          description: description.trim(),
        });
        if (!result.success) {
          setFormError(result.message);
          if (result.details) {
            const errs: Record<string, string> = {};
            result.details.forEach((d) => {
              errs[d.path] = d.message;
            });
            setFieldErrors(errs);
          }
          return;
        }
        setSuccessMessage('تم إنشاء مسودة المستخلص بنجاح');
        router.push(`/subcontractor-billings/${result.data.id}`);
      }
    });
  }

  const approvedCommitments = currentProject?.approvedCommitments ?? [];
  const hasNoCommitments = !isEdit && approvedCommitments.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Success banner */}
      {successMessage && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error banner */}
      {formError && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* No approved commitments warning */}
      {hasNoCommitments && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>لا توجد التزامات معتمدة للمشروع المحدد. يجب أن يكون الالتزام معتمداً (APPROVED) قبل إنشاء المستخلص.</span>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* 1. Project selector */}
        <div className="sm:col-span-2">
          <label
            htmlFor="billing-project"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            المشروع <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <select
            id="billing-project"
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            disabled={isEdit || isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="billing-project-select"
            aria-required="true"
          >
            <option value="">— اختر المشروع —</option>
            {formData.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          {fieldErrors.projectId && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.projectId}</p>
          )}
        </div>

        {/* 2. Approved Commitment selector */}
        <div className="sm:col-span-2">
          <label
            htmlFor="billing-commitment"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            الالتزام المعتمد <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <select
            id="billing-commitment"
            value={selectedCommitmentId}
            onChange={(e) => handleCommitmentChange(e.target.value)}
            disabled={isEdit || isPending || hasNoCommitments}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="billing-commitment-select"
            aria-required="true"
          >
            <option value="">— اختر الالتزام —</option>
            {approvedCommitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.vendorName}
                {c.referenceNumber ? ` — ${c.referenceNumber}` : ''}
                {' — '}
                {formatAmount(c.amount)} ر.س
              </option>
            ))}
          </select>
          {fieldErrors.commitmentId && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.commitmentId}</p>
          )}
          {selectedCommitment && (
            <p className="mt-1 text-xs text-muted-foreground">
              قيمة العقد:{' '}
              <span className="font-mono font-semibold text-foreground">
                {formatAmount(selectedCommitment.amount)} ر.س
              </span>
            </p>
          )}
        </div>

        {/* 3. Subcontractor Name (read-only — derived from commitment) */}
        <div className="sm:col-span-2">
          <label
            htmlFor="billing-subcontractor-name"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            اسم مقاول الباطن
            <span className="ms-2 text-xs font-normal text-muted-foreground">(مستخرج من الالتزام)</span>
          </label>
          <input
            id="billing-subcontractor-name"
            type="text"
            readOnly
            value={subcontractorName}
            placeholder="يُشتق تلقائياً من الالتزام المحدد"
            className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground cursor-not-allowed opacity-80 focus:outline-none"
            data-testid="billing-subcontractor-name-display"
            aria-readonly="true"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            يُحدد اسم مقاول الباطن تلقائياً من بيانات الالتزام المعتمد ولا يمكن تعديله (القرار #24).
          </p>
        </div>

        {/* 4. Reference Number */}
        <div>
          <label
            htmlFor="billing-reference-number"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            رقم مرجع المستخلص
            <span className="ms-1 text-xs font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <input
            id="billing-reference-number"
            type="text"
            placeholder="INV-2026-001"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            disabled={isPending}
            maxLength={100}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            data-testid="billing-reference-number-input"
          />
          {fieldErrors.referenceNumber && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.referenceNumber}</p>
          )}
        </div>

        {/* 5. Billing Period */}
        <div>
          <label
            htmlFor="billing-period"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            فترة المستخلص <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="billing-period"
            type="text"
            placeholder="مثال: سبتمبر 2026 أو الشهر الأول"
            value={billingPeriod}
            onChange={(e) => setBillingPeriod(e.target.value)}
            disabled={isPending}
            maxLength={100}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            data-testid="billing-period-input"
            aria-required="true"
          />
          {fieldErrors.billingPeriod && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.billingPeriod}</p>
          )}
        </div>

        {/* 6. Claim Date */}
        <div>
          <label
            htmlFor="billing-claim-date"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            تاريخ المطالبة <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="billing-claim-date"
            type="date"
            value={claimDate}
            onChange={(e) => setClaimDate(e.target.value)}
            max={todayISO()}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            data-testid="billing-claim-date-input"
            aria-required="true"
          />
          {fieldErrors.claimDate && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.claimDate}</p>
          )}
        </div>

        {/* 7. Gross Amount */}
        <div>
          <label
            htmlFor="billing-gross-amount"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            المبلغ الإجمالي (ر.س) <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="billing-gross-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={grossAmount}
            onChange={(e) => setGrossAmount(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            data-testid="billing-gross-amount-input"
            aria-required="true"
          />
          {fieldErrors.grossAmount && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.grossAmount}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            المبلغ الإجمالي قبل أي خصومات. يُدخل كأرقام عشرية (مثال: 15000.00)
          </p>
        </div>

        {/* 8. Description */}
        <div className="sm:col-span-2">
          <label
            htmlFor="billing-description"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            نطاق العمل والوصف <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <textarea
            id="billing-description"
            rows={4}
            placeholder="وصف الأعمال المنجزة خلال فترة المستخلص..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            maxLength={2000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 resize-none"
            data-testid="billing-description-input"
            aria-required="true"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground text-start">
            {description.length} / 2000
          </p>
        </div>
      </div>

      {/* Form actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
          data-testid="billing-form-cancel-button"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending || hasNoCommitments}
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          data-testid="billing-form-save-button"
        >
          {isPending
            ? isEdit
              ? 'جاري الحفظ...'
              : 'جاري الإنشاء...'
            : isEdit
              ? 'حفظ التعديلات'
              : 'حفظ المسودة'}
        </button>
      </div>
    </form>
  );
}
