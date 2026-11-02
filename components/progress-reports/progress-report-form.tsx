'use client';

/**
 * components/progress-reports/progress-report-form.tsx
 *
 * Reusable form for creating and editing Site Engineer Progress Reports.
 * Displays field inputs with Arabic labels, character hints, validation feedback,
 * locked BD-21 Privacy compliance banner, and CR-08 milestone tagging.
 *
 * RTL & Arabic first, CSS logical properties.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ActiveProjectOptionDTO, ProgressReportDetailDTO } from '@/lib/progress-reports/types';
import {
  AlertCircle,
  ShieldAlert,
  Save,
  ArrowRight,
  Flag,
  Info,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

export interface MilestoneOptionDTO {
  id: string;
  title: string;
  orderIndex: number;
  status: string;
}

function areMilestoneSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

interface ProgressReportFormProps {
  initialData?: ProgressReportDetailDTO;
  projects?: ActiveProjectOptionDTO[];
  availableMilestones?: MilestoneOptionDTO[];
  milestonesByProject?: Record<string, MilestoneOptionDTO[]>;
  onSubmit: (formData: FormData) => Promise<{ success: boolean; error?: string; id?: string }>;
  isEdit?: boolean;
}

export function ProgressReportForm({
  initialData,
  projects = [],
  availableMilestones,
  milestonesByProject,
  onSubmit,
  isEdit = false,
}: ProgressReportFormProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialData?.projectId ?? (projects[0]?.id ?? ''));
  const [reportDate, setReportDate] = useState(
    initialData?.reportDate ?? new Date().toISOString().slice(0, 10),
  );
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [workDescription, setWorkDescription] = useState(initialData?.workDescription ?? '');
  const [progressPercentage, setProgressPercentage] = useState<string>(
    initialData?.progressPercentage !== null && initialData?.progressPercentage !== undefined
      ? String(initialData.progressPercentage)
      : '',
  );
  const [blockers, setBlockers] = useState(initialData?.blockers ?? '');
  const [nextPeriodPlan, setNextPeriodPlan] = useState(initialData?.nextPeriodPlan ?? '');
  const [weatherCondition, setWeatherCondition] = useState(initialData?.weatherCondition ?? '');

  // Milestone tagging state (CR-08 / BD-17)
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>(
    () => initialData?.milestones?.map((m) => m.id) ?? [],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute active milestones for the currently selected project
  const currentMilestones: MilestoneOptionDTO[] = isEdit
    ? (availableMilestones ?? [])
    : (milestonesByProject?.[projectId] ?? availableMilestones ?? []);

  // Whether milestone input capability is enabled for this form
  const hasMilestoneCapability =
    availableMilestones !== undefined || milestonesByProject !== undefined;

  function handleProjectChange(newProjectId: string) {
    setProjectId(newProjectId);
    // Reset milestone selections when changing projects in creation flow
    setSelectedMilestoneIds([]);
  }

  function handleMilestoneToggle(milestoneId: string) {
    setSelectedMilestoneIds((prev) =>
      prev.includes(milestoneId)
        ? prev.filter((id) => id !== milestoneId)
        : [...prev, milestoneId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    if (!isEdit) {
      formData.append('projectId', projectId);
      formData.append('reportDate', reportDate);
    }
    formData.append('title', title);
    formData.append('workDescription', workDescription);
    if (progressPercentage !== '') {
      formData.append('progressPercentage', progressPercentage);
    }
    if (blockers.trim() !== '') {
      formData.append('blockers', blockers.trim());
    }
    if (nextPeriodPlan.trim() !== '') {
      formData.append('nextPeriodPlan', nextPeriodPlan.trim());
    }
    if (weatherCondition.trim() !== '') {
      formData.append('weatherCondition', weatherCondition.trim());
    }

    // Milestone selection synchronization (CR-08 / BD-17)
    // In EDIT mode, omit milestone inputs when the selected set is unchanged, preserving the fast path
    const initialMilestoneIds = initialData?.milestones?.map((m) => m.id) ?? [];
    const shouldSubmitMilestones = isEdit
      ? hasMilestoneCapability && !areMilestoneSetsEqual(selectedMilestoneIds, initialMilestoneIds)
      : hasMilestoneCapability;

    if (shouldSubmitMilestones) {
      formData.append('_hasMilestoneInput', 'true');
      for (const mid of selectedMilestoneIds) {
        formData.append('milestoneIds', mid);
      }
    }

    try {
      const result = await onSubmit(formData);
      if (!result.success) {
        setError(result.error ?? 'فشل حفظ التقرير');
        return;
      }
      const targetId = result.id ?? initialData?.id;
      if (targetId) {
        router.push(`/my-reports/${targetId}`);
      } else {
        router.push('/my-reports');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Privacy Notice Banner (BD-21) */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
        <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-bold">تنبيه خصوصية البيانات:</span>
          <p className="mt-0.5 leading-relaxed">
            يرجى عدم إدخال أسماء العمال أو هوياتهم، أو أرقام المراجع الخاصة بالعمال، أو أرقام الهواتف، أو أي معلومات مالية شخصية داخل النصوص الوصفية.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        {/* Project & Date Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Project */}
          <div>
            <label htmlFor="project-select" className="block text-xs font-semibold text-foreground">
              المشروع <span className="text-destructive">*</span>
            </label>
            {isEdit ? (
              <div className="mt-1.5 rounded-md border border-input bg-muted px-3.5 py-2 text-sm text-foreground">
                {initialData?.project?.name} ({initialData?.project?.code})
              </div>
            ) : (
              <select
                id="project-select"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                required
                className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="project-select"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Report Date */}
          <div>
            <label htmlFor="report-date" className="block text-xs font-semibold text-foreground">
              تاريخ التقرير <span className="text-destructive">*</span>
            </label>
            {isEdit ? (
              <div className="mt-1.5 rounded-md border border-input bg-muted px-3.5 py-2 text-sm text-foreground">
                {initialData?.reportDate}
              </div>
            ) : (
              <input
                type="date"
                id="report-date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                required
                className="mt-1.5 w-full rounded-md border border-input bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="report-date-input"
              />
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              التاريخ التقويمي الذي تغطيه الأعمال الميدانية (لا يمكن أن يتجاوز تاريخ الغد).
            </p>
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="report-title" className="block text-xs font-semibold text-foreground">
            عنوان التقرير <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="report-title"
            maxLength={150}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: تقرير إنجاز أعمال صب خرسانة الأساسات"
            className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="report-title-input"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>عنوان وصفي موجز (حتى 150 حرف)</span>
            <span>{title.length}/150</span>
          </div>
        </div>

        {/* Milestone Tagging Section (CR-08 / BD-17) */}
        {hasMilestoneCapability && (
          <div
            className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
            data-testid="milestones-selection-section"
          >
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <Flag className="size-4 text-primary" aria-hidden="true" />
                <span className="text-xs font-bold text-foreground">
                  المحطات التخطيطية المستهدفة بالتقرير
                </span>
              </div>
              <span
                className="text-[11px] font-mono text-muted-foreground"
                data-testid="selected-milestones-count"
              >
                {selectedMilestoneIds.length} محطات محددة
              </span>
            </div>

            {/* Authoritative Callout Note (§6.4) */}
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5 text-xs text-blue-800 dark:text-blue-300">
              <Info className="size-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                الصور المرفقة بالتقرير تؤهل المحطات المرتبطة للاعتماد فقط بعد مراجعة التقرير واعتماده من قبل المدير.
              </p>
            </div>

            {currentMilestones.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                لا توجد معالم نشطة مسجلة لهذا المشروع حالياً.
              </p>
            ) : (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pe-1"
                data-testid="milestones-checkbox-list"
              >
                {currentMilestones.map((m) => {
                  const isChecked = selectedMilestoneIds.includes(m.id);
                  const isPreviouslyLinked = Boolean(
                    initialData?.milestones?.some((linked) => linked.id === m.id),
                  );
                  const isCompleted = m.status === 'COMPLETED';
                  const isCancelled = m.status === 'CANCELLED';
                  const isImmutable = isPreviouslyLinked && (isCompleted || isCancelled);

                  return (
                    <label
                      key={m.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-primary/50 bg-primary/5 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                      } ${isImmutable ? 'opacity-80 bg-muted/60 cursor-not-allowed' : ''}`}
                      data-testid={`milestone-option-${m.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isImmutable}
                        onChange={() => handleMilestoneToggle(m.id)}
                        className="mt-0.5 rounded border-input text-primary focus:ring-primary"
                        data-testid={`milestone-checkbox-${m.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-foreground truncate">
                            {m.title}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                            #{m.orderIndex + 1}
                          </span>
                        </div>
                        {isImmutable && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            <Lock className="size-2.5 shrink-0" />
                            <span>
                              {isCompleted
                                ? 'محطة مكتملة (ارتباط ثابت)'
                                : 'محطة ملغاة (ارتباط ثابت)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Work Description */}
        <div>
          <label htmlFor="work-description" className="block text-xs font-semibold text-foreground">
            وصف الأعمال المنجزة <span className="text-destructive">*</span>
          </label>
          <textarea
            id="work-description"
            rows={5}
            maxLength={3000}
            required
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            placeholder="اكتب وصفاً سردياً تفصيلياً للأعمال التي تمت بالموقع خلال فترة التقرير..."
            className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            data-testid="work-description-input"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>سرد الأعمال التشغيلية فقط دون إدراج بيانات مالية أو أجور</span>
            <span>{workDescription.length}/3000</span>
          </div>
        </div>

        {/* Percentage & Weather Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Progress Percentage */}
          <div>
            <label htmlFor="progress-percentage" className="block text-xs font-semibold text-foreground">
              نسبة الإنجاز التقديرية للمشروع % (اختياري)
            </label>
            <input
              type="number"
              id="progress-percentage"
              min={0}
              max={100}
              step={1}
              value={progressPercentage}
              onChange={(e) => setProgressPercentage(e.target.value)}
              placeholder="0 - 100"
              className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="progress-percentage-input"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              تقدير نوعي ذاتي لتقدم المشروع، لا يرتبط بأي حسابات مالية أو جداول زمنية.
            </p>
          </div>

          {/* Weather Condition */}
          <div>
            <label htmlFor="weather-condition" className="block text-xs font-semibold text-foreground">
              حالة الطقس وظروف الموقع (اختياري)
            </label>
            <input
              type="text"
              id="weather-condition"
              maxLength={100}
              value={weatherCondition}
              onChange={(e) => setWeatherCondition(e.target.value)}
              placeholder="مثال: صحو، حار 42 درجة، رياح محملة بالأتربة"
              className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="weather-condition-input"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>الظروف المناخية في موقع المشروع</span>
              <span>{weatherCondition.length}/100</span>
            </div>
          </div>
        </div>

        {/* Blockers */}
        <div>
          <label htmlFor="blockers" className="block text-xs font-semibold text-foreground">
            المعوقات والملاحظات الميدانية (اختياري)
          </label>
          <textarea
            id="blockers"
            rows={3}
            maxLength={1500}
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="سجل أي عوائق تشغيلية أو مخاطر ظهرت في الموقع..."
            className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="blockers-input"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>عوائق وملاحظات الموقع التشغيلية</span>
            <span>{blockers.length}/1500</span>
          </div>
        </div>

        {/* Next Period Plan */}
        <div>
          <label htmlFor="next-period-plan" className="block text-xs font-semibold text-foreground">
            خطة الأعمال للفترة القادمة (اختياري)
          </label>
          <textarea
            id="next-period-plan"
            rows={3}
            maxLength={1500}
            value={nextPeriodPlan}
            onChange={(e) => setNextPeriodPlan(e.target.value)}
            placeholder="الأعمال المستهدفة للتنفيذ خلال الفترة القادمة..."
            className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="next-period-plan-input"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>الأنشطة المخطط تنفيذها تالياً</span>
            <span>{nextPeriodPlan.length}/1500</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Link
          href="/my-reports"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          <span>إلغاء والعودة للقائمة</span>
        </Link>

        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="save-report-button"
          className="flex items-center gap-1.5"
        >
          <Save className="size-4" aria-hidden="true" />
          <span>{isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ كمسودة'}</span>
        </Button>
      </div>
    </form>
  );
}
