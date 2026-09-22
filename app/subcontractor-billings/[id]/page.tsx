import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import {
  ChevronRight,
  Receipt,
  Calendar,
  Building2,
  Hash,
  User,
  FileText,
} from 'lucide-react';

import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getBilling, getCommitmentBillings } from '@/lib/subcontractor-billings';
import { BillingStatusBadge } from '../components/billing-status-badge';
import { CommitmentBillingSummary } from '../components/commitment-billing-summary';
import { BillingDetailActions } from '../components/billing-detail-actions';

export const metadata: Metadata = {
  title: 'تفاصيل المستخلص',
  description: 'عرض تفاصيل مستخلص مقاول باطن',
};

interface BillingDetailPageProps {
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

export default async function BillingDetailPage({ params }: BillingDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  if (!policies.canViewBillings(user)) {
    notFound();
  }

  let billing;
  try {
    billing = await getBilling(id);
  } catch {
    notFound();
  }

  const commitmentSummary = await getCommitmentBillings(billing.commitmentId).catch(() => null);

  const isManager = user.role === Role.MANAGER;
  const isAccountant = user.role === Role.ACCOUNTANT;
  const isOwner = billing.createdById === user.id;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/subcontractor-billings" className="hover:text-foreground transition-colors">
            مستخلصات مقاولي الباطن
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="text-foreground font-medium font-mono">
            {billing.referenceNumber ?? id.slice(-8).toUpperCase()}
          </span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Receipt className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-foreground">
                  مستخلص: {billing.subcontractorName}
                </h1>
                <BillingStatusBadge status={billing.status} />
              </div>
              {billing.referenceNumber && (
                <p className="text-xs font-mono text-muted-foreground">
                  رقم المرجع: {billing.referenceNumber}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {billing.project?.name} ({billing.project?.code})
              </p>
            </div>
          </div>

          {/* Action buttons — state + role aware */}
          <BillingDetailActions
            billing={billing}
            isManager={isManager}
            isAccountant={isAccountant}
            isOwner={isOwner}
          />
        </div>

        {/* Billing Details Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Gross Amount — prominent */}
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">المبلغ الإجمالي للمستخلص</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              {formatMoney(billing.grossAmount)}
              <span className="text-base font-normal ms-2 text-muted-foreground">ر.س</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              المبلغ الإجمالي قبل أي خصومات — هذا المبلغ لا يُنشئ مصروفاً ولا يخفّض رصيد الموازنة عند الاعتماد.
            </p>
          </div>

          {/* Project */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">المشروع</p>
            </div>
            <p className="text-sm font-semibold text-foreground">{billing.project?.name ?? '—'}</p>
            <p className="text-xs font-mono text-muted-foreground">{billing.project?.code}</p>
          </div>

          {/* Budget Line */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">بند الموازنة</p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {billing.budgetLine?.description ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              سقف البند: {billing.budgetLine ? formatMoney(billing.budgetLine.amount) + ' ر.س' : '—'}
            </p>
          </div>

          {/* Commitment */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">الالتزام المرتبط</p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {billing.commitment?.vendorName ?? '—'}
            </p>
            {billing.commitment?.referenceNumber && (
              <p className="text-xs font-mono text-muted-foreground">
                {billing.commitment.referenceNumber}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              قيمة العقد: {billing.commitment ? formatMoney(billing.commitment.amount) + ' ر.س' : '—'}
            </p>
          </div>

          {/* Billing Period */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">فترة المستخلص</p>
            </div>
            <p className="text-sm font-semibold text-foreground">{billing.billingPeriod}</p>
          </div>

          {/* Claim Date */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">تاريخ المطالبة</p>
            </div>
            <p className="text-sm font-semibold text-foreground">{formatDate(billing.claimDate)}</p>
          </div>

          {/* Subcontractor */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <User className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground">مقاول الباطن</p>
            </div>
            <p className="text-sm font-semibold text-foreground">{billing.subcontractorName}</p>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-3">نطاق العمل والوصف</h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{billing.description}</p>
        </div>

        {/* Rejection reason */}
        {billing.status === 'REJECTED' && billing.rejectionReason && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <h2 className="text-sm font-semibold text-destructive mb-2">سبب الرفض</h2>
            <p className="text-sm text-destructive">{billing.rejectionReason}</p>
            {billing.rejectedBy && (
              <p className="text-xs text-destructive/70 mt-2">
                رُفض بواسطة: {billing.rejectedBy.name} — {formatDate(billing.rejectedAt)}
              </p>
            )}
          </div>
        )}

        {/* Audit metadata */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">سجل الإجراءات</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
              <dt className="text-muted-foreground shrink-0">أنشئ بواسطة</dt>
              <dd className="font-medium text-foreground text-end">
                {billing.createdBy.name}
                <span className="block text-xs font-normal text-muted-foreground">
                  {formatDate(billing.createdAt)}
                </span>
              </dd>
            </div>

            {billing.submittedBy && (
              <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground shrink-0">قُدّم بواسطة</dt>
                <dd className="font-medium text-foreground text-end">
                  {billing.submittedBy.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDate(billing.submittedAt)}
                  </span>
                </dd>
              </div>
            )}

            {billing.approvedBy && (
              <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground shrink-0">اعتُمد بواسطة</dt>
                <dd className="font-medium text-emerald-700 dark:text-emerald-400 text-end">
                  {billing.approvedBy.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDate(billing.approvedAt)}
                  </span>
                </dd>
              </div>
            )}

            {billing.rejectedBy && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">رُفض بواسطة</dt>
                <dd className="font-medium text-destructive text-end">
                  {billing.rejectedBy.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDate(billing.rejectedAt)}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Commitment Billing Summary */}
        {commitmentSummary && (
          <CommitmentBillingSummary summary={commitmentSummary} />
        )}
      </main>
    </div>
  );
}
