import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import {
  ChevronRight,
  Users,
  DollarSign,
  User,
  Clock,
  XCircle,
  Ban,
} from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getPayrollEntry, getProjectLaborSummary } from '@/lib/payroll';
import { PayrollStatusBadge } from '../components/payroll-status-badge';
import { PayrollDetailActions } from '../components/payroll-detail-actions';
import { ProjectLaborSummaryCard } from '../components/project-labor-summary-card';

export const metadata: Metadata = {
  title: 'تفاصيل قيد الأجر',
  description: 'عرض تفاصيل قيد أجر العمالة وتتبعه الرقابي',
};

interface PayrollDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatMoney(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export default async function PayrollDetailPage({ params }: PayrollDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  // Fail-closed authorization guard
  if (!policies.canViewPayrollDetails(user)) {
    notFound();
  }

  let payroll;
  try {
    payroll = await getPayrollEntry(id);
  } catch {
    notFound();
  }

  const laborSummary = await getProjectLaborSummary(payroll.projectId).catch(() => null);

  const isManager = user.role === Role.MANAGER;
  const isAccountant = user.role === Role.ACCOUNTANT;
  const isOwner = payroll.createdById === user.id;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/payroll" className="hover:text-foreground transition-colors">
            قيود أجور العمالة الميدانية
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium">
            {payroll.workerName} ({payroll.periodFormattedAr})
          </span>
        </nav>

        {/* Header Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Users className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-foreground">
                  قيد أجر: {payroll.workerName}
                </h1>
                <PayrollStatusBadge status={payroll.status} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>الفترة: <strong className="text-foreground">{payroll.periodFormattedAr}</strong></span>
                <span>•</span>
                <span>المشروع: <strong className="text-foreground">{payroll.project?.name} ({payroll.project?.code})</strong></span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <PayrollDetailActions
            payroll={payroll}
            isManager={isManager}
            isAccountant={isAccountant}
            isOwner={isOwner}
          />
        </div>

        {/* Rejection / Cancellation Banners */}
        {payroll.status === 'REJECTED' && payroll.rejectionReason && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3"
            data-testid="payroll-rejection-banner"
          >
            <XCircle className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">سبب الرفض:</p>
              <p className="mt-1 text-xs leading-relaxed">{payroll.rejectionReason}</p>
              {payroll.rejectedAt && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  بتاريخ: {formatDate(payroll.rejectedAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {payroll.status === 'CANCELLED' && payroll.cancellationReason && (
          <div
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-400 flex items-start gap-3"
            data-testid="payroll-cancellation-banner"
          >
            <Ban className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">سبب الإلغاء:</p>
              <p className="mt-1 text-xs leading-relaxed">{payroll.cancellationReason}</p>
              {payroll.cancelledAt && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  بتاريخ: {formatDate(payroll.cancelledAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial & Project Info */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <DollarSign className="size-4 text-primary" aria-hidden="true" />
              <span>البيانات المالية وبند الموازنة</span>
            </h2>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">مبلغ قيد الأجر:</dt>
                <dd className="font-mono text-base font-bold text-foreground mt-0.5">
                  {formatMoney(payroll.amount)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">{payroll.currency}</span>
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground">الفترة المعتمدة:</dt>
                <dd className="font-semibold text-foreground mt-0.5">
                  {payroll.periodFormattedAr}
                </dd>
              </div>

              <div className="col-span-2 pt-2 border-t border-border/60">
                <dt className="text-muted-foreground">بند موازنة الأجور (LABOR):</dt>
                <dd className="font-medium text-foreground mt-0.5">
                  {payroll.budgetLine?.description ?? '—'}
                </dd>
                {payroll.budgetLine?.amount && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    السقف المعتمد للبند: {formatMoney(payroll.budgetLine.amount)} ر.س
                  </p>
                )}
              </div>

              <div className="col-span-2 pt-2 border-t border-border/60">
                <dt className="text-muted-foreground">وصف القيد وملاحظات الموقع:</dt>
                <dd className="text-foreground mt-0.5 whitespace-pre-wrap leading-relaxed">
                  {payroll.description}
                </dd>
              </div>
            </dl>
          </div>

          {/* Worker Snapshot */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <User className="size-4 text-primary" aria-hidden="true" />
              <span>بيانات العامل الميداني (لقطة موثقة)</span>
            </h2>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <dt className="text-muted-foreground">اسم العامل الكامل:</dt>
                <dd className="text-sm font-bold text-foreground mt-0.5">
                  {payroll.workerName}
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground">الرقم المرجعي / الشارة:</dt>
                <dd className="font-mono text-foreground mt-0.5">
                  {payroll.workerReference ?? '—'}
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground">المهنة / المسمى الوظيفي:</dt>
                <dd className="text-foreground mt-0.5">
                  {payroll.tradeOrTitle ?? '—'}
                </dd>
              </div>

              <div className="col-span-2 pt-2 border-t border-border/60">
                <dt className="text-muted-foreground">المشروع:</dt>
                <dd className="font-semibold text-foreground mt-0.5">
                  {payroll.project?.name} ({payroll.project?.code})
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Accountability & Audit Trail */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Clock className="size-4 text-primary" aria-hidden="true" />
            <span>سجل الرقابة والمسؤولية والتدقيق</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Created By */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <span className="text-muted-foreground">إعداد المسودة:</span>
              <p className="font-semibold text-foreground mt-1">
                {payroll.createdBy?.name ?? '—'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDate(payroll.createdAt)}
              </p>
            </div>

            {/* Submitted By */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <span className="text-muted-foreground">التقديم للاعتماد:</span>
              <p className="font-semibold text-foreground mt-1">
                {payroll.submittedBy?.name ?? '—'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDate(payroll.submittedAt)}
              </p>
            </div>

            {/* Approved By */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <span className="text-muted-foreground">الاعتماد النهائي (المدير):</span>
              <p className="font-semibold text-foreground mt-1">
                {payroll.approvedBy?.name ?? '—'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDate(payroll.approvedAt)}
              </p>
            </div>

            {/* Status & Update */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <span className="text-muted-foreground">آخر تحديث:</span>
              <p className="font-semibold text-foreground mt-1">
                {formatDate(payroll.updatedAt)}
              </p>
              <div className="mt-1">
                <PayrollStatusBadge status={payroll.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Project Labor Summary Card */}
        {laborSummary && (
          <ProjectLaborSummaryCard
            summary={laborSummary}
            title="الرقابة الإجمالية على موازنة الأجور للمشروع"
          />
        )}
      </main>
    </div>
  );
}
