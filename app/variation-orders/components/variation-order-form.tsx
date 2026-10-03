'use client';

/**
 * app/variation-orders/components/variation-order-form.tsx
 *
 * Client form component for creating and editing Variation Orders.
 * Supports:
 * - Project selection with dynamic budget lines and commitments
 * - Line-item detailed mode with live financial delta preview
 * - Lump-sum single amount mode
 * - Server-authoritative submission via createVariationOrderAction / updateVariationOrderAction
 *
 * Follows AGENTS.md §9, §13, §14, §17, §19, §26.
 */

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, AlertCircle, Calculator } from 'lucide-react';
import type { VariationOrderDetailDTO, VariationFormProjectDTO } from '@/lib/variation-orders';
import {
  createVariationOrderAction,
  updateVariationOrderAction,
  type ActionResult,
} from '../actions';

interface LineItemState {
  id?: string;
  description: string;
  unit: string;
  originalQuantity: string;
  revisedQuantity: string;
  originalRate: string;
  revisedRate: string;
  notes: string;
}

interface VariationOrderFormProps {
  projects: VariationFormProjectDTO[];
  initialData?: VariationOrderDetailDTO;
}

export function VariationOrderForm({ projects, initialData }: VariationOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(initialData);

  // Form State
  const [projectId, setProjectId] = useState(initialData?.projectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [reason, setReason] = useState(initialData?.reason ?? '');
  const [scopeImpact, setScopeImpact] = useState(initialData?.scopeImpact ?? '');
  const [budgetLineId, setBudgetLineId] = useState(initialData?.budgetLineId ?? '');
  const [commitmentId, setCommitmentId] = useState(initialData?.commitmentId ?? '');

  // Mode: Lines or Lump Sum
  const [mode, setMode] = useState<'LINES' | 'LUMP_SUM'>(
    initialData && initialData.lines.length === 0 ? 'LUMP_SUM' : 'LINES',
  );

  const [impactAmount, setImpactAmount] = useState(
    initialData && initialData.lines.length === 0 ? initialData.impactAmount : '0.00',
  );

  const [lines, setLines] = useState<LineItemState[]>(
    initialData && initialData.lines.length > 0
      ? initialData.lines.map((l) => ({
          id: l.id,
          description: l.description,
          unit: l.unit,
          originalQuantity: l.originalQuantity,
          revisedQuantity: l.revisedQuantity,
          originalRate: l.originalRate,
          revisedRate: l.revisedRate,
          notes: l.notes ?? '',
        }))
      : [
          {
            description: '',
            unit: 'م3',
            originalQuantity: '0',
            revisedQuantity: '0',
            originalRate: '0.00',
            revisedRate: '0.00',
            notes: '',
          },
        ],
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Active project options
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  // Live client-side preview calculation (Server recalculates authoritatively with Decimal)
  const previewTotalImpact = useMemo(() => {
    if (mode === 'LUMP_SUM') {
      const parsed = parseFloat(impactAmount);
      return isNaN(parsed) ? 0 : parsed;
    }

    let total = 0;
    for (const line of lines) {
      const origQty = parseFloat(line.originalQuantity) || 0;
      const revQty = parseFloat(line.revisedQuantity) || 0;
      const origRate = parseFloat(line.originalRate) || 0;
      const revRate = parseFloat(line.revisedRate) || 0;

      const origTotal = origQty * origRate;
      const revTotal = revQty * revRate;
      total += revTotal - origTotal;
    }
    return total;
  }, [mode, impactAmount, lines]);

  // Handle adding line
  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        description: '',
        unit: 'م3',
        originalQuantity: '0',
        revisedQuantity: '0',
        originalRate: '0.00',
        revisedRate: '0.00',
        notes: '',
      },
    ]);
  }

  // Handle removing line
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // Handle updating line
  function updateLine(index: number, field: keyof LineItemState, value: string) {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current) {
        next[index] = { ...current, [field]: value };
      }
      return next;
    });
  }

  // Handle submit
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      let result: ActionResult;

      if (isEdit && initialData) {
        result = await updateVariationOrderAction({
          id: initialData.id,
          title,
          description,
          reason,
          scopeImpact: scopeImpact || null,
          budgetLineId: budgetLineId || null,
          commitmentId: commitmentId || null,
          impactAmount: mode === 'LUMP_SUM' ? impactAmount : undefined,
          lines:
            mode === 'LINES'
              ? lines.map((l) => ({
                  id: l.id,
                  description: l.description,
                  unit: l.unit,
                  originalQuantity: l.originalQuantity || '0',
                  revisedQuantity: l.revisedQuantity || '0',
                  originalRate: l.originalRate || '0.00',
                  revisedRate: l.revisedRate || '0.00',
                  notes: l.notes || null,
                }))
              : [],
        });
      } else {
        result = await createVariationOrderAction({
          projectId,
          title,
          description,
          reason,
          scopeImpact: scopeImpact || null,
          budgetLineId: budgetLineId || null,
          commitmentId: commitmentId || null,
          impactAmount: mode === 'LUMP_SUM' ? impactAmount : undefined,
          lines:
            mode === 'LINES'
              ? lines.map((l) => ({
                  description: l.description,
                  unit: l.unit,
                  originalQuantity: l.originalQuantity || '0',
                  revisedQuantity: l.revisedQuantity || '0',
                  originalRate: l.originalRate || '0.00',
                  revisedRate: l.revisedRate || '0.00',
                  notes: l.notes || null,
                }))
              : [],
        });
      }

      if (result.success) {
        router.push(`/variation-orders/${result.data.id}`);
        router.refresh();
      } else {
        setFormError(result.message || 'حدث خطأ أثناء حفظ أمر التغيير');
        if (result.details) {
          const mapped: Record<string, string> = {};
          for (const d of result.details) {
            mapped[d.path] = d.message;
          }
          setFieldErrors(mapped);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" data-testid="variation-order-form">
      {/* Global error alert */}
      {formError && (
        <div
          className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
          data-testid="form-error-banner"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      {/* Project & Linkages Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b border-border pb-3">
          بيانات المشروع والارتباطات
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="project-select">
              المشروع <span className="text-destructive">*</span>
            </label>
            <select
              id="project-select"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setBudgetLineId('');
                setCommitmentId('');
              }}
              disabled={isEdit || projects.length === 0}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
              data-testid="project-select"
              required
            >
              {projects.length === 0 ? (
                <option value="">لا توجد مشاريع نشطة متاحة</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))
              )}
            </select>
            {fieldErrors.projectId && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.projectId}</p>
            )}
          </div>

          {/* Budget Line */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="budget-line-select">
              بند الموازنة المتأثر (اختياري)
            </label>
            <select
              id="budget-line-select"
              value={budgetLineId}
              onChange={(e) => setBudgetLineId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
              data-testid="budget-line-select"
            >
              <option value="">-- اختياري: تخصيص بند محدد --</option>
              {selectedProject?.budgetLines.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.category} - {b.description} ({b.amount} ر.س)
                </option>
              ))}
            </select>
          </div>

          {/* Commitment */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="commitment-select">
              الارتباط / عقد مقاول الباطن (اختياري)
            </label>
            <select
              id="commitment-select"
              value={commitmentId}
              onChange={(e) => setCommitmentId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
              data-testid="commitment-select"
            >
              <option value="">-- اختياري: ربط بعقد مقاول / مورد --</option>
              {selectedProject?.commitments.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.orderNumber} - {c.vendorName} ({c.allocatedAmount} ر.س)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Details Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b border-border pb-3">
          تفاصيل ومبررات أمر التغيير
        </h2>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="title-input">
            عنوان أمر التغيير <span className="text-destructive">*</span>
          </label>
          <input
            id="title-input"
            type="text"
            placeholder="مثال: إضافة أعمال تسوية إضافية لقطاع ب والمواقف"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="title-input"
            required
            minLength={3}
            maxLength={200}
          />
          {fieldErrors.title && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.title}</p>
          )}
        </div>

        {/* Description & Scope */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="description-input">
              وصف التغيير المطلوب <span className="text-destructive">*</span>
            </label>
            <textarea
              id="description-input"
              rows={3}
              placeholder="وصف فني تفصيلي للأعمال المراد إضافتها أو تعديلها أو حذفها..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
              data-testid="description-input"
              required
            />
            {fieldErrors.description && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="reason-input">
              المبرر الفني / الميداني <span className="text-destructive">*</span>
            </label>
            <textarea
              id="reason-input"
              rows={3}
              placeholder="أسباب طلب التغيير (تعديل تصاميم، توجيه الاستشاري، معطيات التربة الميدانية...)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
              data-testid="reason-input"
              required
            />
            {fieldErrors.reason && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.reason}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="scope-impact-input">
            أثر التغيير على نطاق العمل والجدول (اختياري)
          </label>
          <input
            id="scope-impact-input"
            type="text"
            placeholder="مثال: زيادة في مدة أعمال الحفر بمقدار 5 أيام عمل دون التأثير على المسار الحرج"
            value={scopeImpact}
            onChange={(e) => setScopeImpact(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="scope-impact-input"
          />
        </div>
      </div>

      {/* Financial Structure & Mode */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Calculator className="size-4 text-primary" aria-hidden="true" />
            <span>الهيكل المالي للأمر وتفاصيل البنود</span>
          </h2>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-input p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => setMode('LINES')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                mode === 'LINES'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="mode-lines-btn"
            >
              جدول كميات تفصيلي (BOQ)
            </button>
            <button
              type="button"
              onClick={() => setMode('LUMP_SUM')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                mode === 'LUMP_SUM'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="mode-lump-sum-btn"
            >
              مبلغ مقطوع مباشر
            </button>
          </div>
        </div>

        {mode === 'LUMP_SUM' ? (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              أدخل مبلغ الأثر المالي الإجمالي المباشر. استخدم علامة الموجب (+) أو رقماً عادياً للزيادة، أو علامة السالب (-) للتخفيض والوفر.
            </p>
            <div className="max-w-md">
              <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="lump-sum-input">
                مبلغ الأثر المالي (ر.س) <span className="text-destructive">*</span>
              </label>
              <input
                id="lump-sum-input"
                type="text"
                placeholder="مثال: 25000.00 أو -5000.00"
                value={impactAmount}
                onChange={(e) => setImpactAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                data-testid="lump-sum-input"
                required
              />
              {fieldErrors.impactAmount && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.impactAmount}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                حدد الكميات والأسعار الفردية الأصلية والمعدلة لحساب الأثر المالي لكل بند تلقائياً.
              </p>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                data-testid="add-line-button"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>إضافة بند تغيير</span>
              </button>
            </div>

            {/* Lines Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs text-start">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="py-2.5 px-3 text-start w-12">#</th>
                    <th className="py-2.5 px-3 text-start min-w-[180px]">بيان الأعمال / البند</th>
                    <th className="py-2.5 px-3 text-start w-20">الوحدة</th>
                    <th className="py-2.5 px-3 text-start w-24">الكمية الأصلية</th>
                    <th className="py-2.5 px-3 text-start w-24">الكمية المعدلة</th>
                    <th className="py-2.5 px-3 text-start w-24">السعر الأصلي</th>
                    <th className="py-2.5 px-3 text-start w-24">السعر المعدل</th>
                    <th className="py-2.5 px-3 text-start w-28">فارق البند</th>
                    <th className="py-2.5 px-3 text-end w-12">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const origTotal = (parseFloat(line.originalQuantity) || 0) * (parseFloat(line.originalRate) || 0);
                    const revTotal = (parseFloat(line.revisedQuantity) || 0) * (parseFloat(line.revisedRate) || 0);
                    const delta = revTotal - origTotal;

                    return (
                      <tr key={idx} className="hover:bg-muted/20" data-testid={`line-row-${idx}`}>
                        <td className="py-2 px-3 text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="وصف البند"
                            value={line.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            data-testid={`line-description-${idx}`}
                            required
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="م3"
                            value={line.unit}
                            onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            data-testid={`line-unit-${idx}`}
                            required
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={line.originalQuantity}
                            onChange={(e) => updateLine(idx, 'originalQuantity', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono"
                            data-testid={`line-orig-qty-${idx}`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={line.revisedQuantity}
                            onChange={(e) => updateLine(idx, 'revisedQuantity', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono"
                            data-testid={`line-rev-qty-${idx}`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.originalRate}
                            onChange={(e) => updateLine(idx, 'originalRate', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono"
                            data-testid={`line-orig-rate-${idx}`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.revisedRate}
                            onChange={(e) => updateLine(idx, 'revisedRate', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono"
                            data-testid={`line-rev-rate-${idx}`}
                          />
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-xs">
                          <span
                            className={
                              delta > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : delta < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }
                          >
                            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-end">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              title="حذف البند"
                              data-testid={`remove-line-${idx}`}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live Total Card */}
        <div className="rounded-lg bg-muted/30 border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground">الأثر المالي الصافي المتوقع للأمر:</span>
            <div className="text-xl font-bold font-mono mt-0.5">
              <span
                className={
                  previewTotalImpact > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : previewTotalImpact < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                }
              >
                {previewTotalImpact > 0 ? `+${previewTotalImpact.toFixed(2)}` : previewTotalImpact.toFixed(2)} ر.س
              </span>
              <span className="text-xs text-muted-foreground font-normal ms-2">
                ({previewTotalImpact > 0 ? 'زيادة في تكلفة المشروع' : previewTotalImpact < 0 ? 'تخفيض في تكلفة المشروع' : 'أثر مالي متعادل'})
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            * يتم احتساب المبالغ والكسور بدقة تامة ومعتمدة على الخادم عند الحفظ
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Link
          href={isEdit && initialData ? `/variation-orders/${initialData.id}` : '/variation-orders'}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          إلغاء
        </Link>

        <button
          type="submit"
          disabled={isPending || projects.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          data-testid="submit-variation-form-btn"
        >
          {isPending ? (
            <span>جاري الحفظ...</span>
          ) : (
            <span>{isEdit ? 'تحديث مسودة الأمر' : 'حفظ كمسودة جديدة'}</span>
          )}
        </button>
      </div>
    </form>
  );
}
