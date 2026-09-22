'use client';

/**
 * app/subcontractor-billings/components/billing-list.tsx
 *
 * Filterable RTL table of Subcontractor Billing records.
 *
 * Filters: project, commitment, status, date range.
 * Role-based action visibility for each row.
 * No business logic — delegates all mutations to Server Actions.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Send,
  RotateCcw,
  Eye,
  AlertTriangle,
} from 'lucide-react';

import type { SubcontractorBillingSummaryDTO } from '@/lib/subcontractor-billings/types';
import { BillingStatusBadge } from './billing-status-badge';
import {
  submitBillingAction,
  deleteBillingDraftAction,
  approveBillingAction,
  rejectBillingAction,
  reopenBillingAction,
  cancelBillingAction,
} from '../actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ar-SA');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BillingListProps {
  billings: SubcontractorBillingSummaryDTO[];
  isManager: boolean;
  isAccountant: boolean;
  isEngineer: boolean;
  currentUserId: string;
  /**
   * Per-commitment remaining balance keyed by commitmentId.
   * Provided by the server for display-only context.
   */
  remainingBalances?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { id: 'ALL', label: 'الكل' },
  { id: 'DRAFT', label: 'المسودات' },
  { id: 'SUBMITTED', label: 'قيد الاعتماد' },
  { id: 'APPROVED', label: 'المعتمدة' },
  { id: 'REJECTED', label: 'المرفوضة' },
  { id: 'CANCELLED', label: 'الملغاة' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingList({
  billings,
  isManager,
  isAccountant,
  isEngineer,
  currentUserId,
  remainingBalances = {},
}: BillingListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCommitment, setSelectedCommitment] = useState<string>('ALL');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Error state
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Rejection modal
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Cancellation modal
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Unique projects and commitments for filter dropdowns
  const projects = Array.from(
    new Map(
      billings
        .filter((b): b is typeof b & { project: NonNullable<typeof b.project> } => Boolean(b.project))
        .map((b) => [b.projectId, b.project]),
    ).values(),
  );

  const commitments = Array.from(
    new Map(
      billings
        .filter((b): b is typeof b & { commitment: NonNullable<typeof b.commitment> } => Boolean(b.commitment))
        .map((b) => [b.commitmentId, b.commitment]),
    ).values(),
  );

  // Apply filters
  const filtered = billings.filter((b) => {
    if (selectedStatus !== 'ALL' && b.status !== selectedStatus) return false;
    if (selectedProject !== 'ALL' && b.projectId !== selectedProject) return false;
    if (selectedCommitment !== 'ALL' && b.commitmentId !== selectedCommitment) return false;

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(b.claimDate) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      if (new Date(b.claimDate) >= to) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.subcontractorName.toLowerCase().includes(q) ||
        b.billingPeriod.toLowerCase().includes(q) ||
        (b.referenceNumber?.toLowerCase().includes(q) ?? false) ||
        (b.project?.name.toLowerCase().includes(q) ?? false) ||
        (b.commitment?.vendorName.toLowerCase().includes(q) ?? false)
      );
    }

    return true;
  });

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  function handleAction<T>(
    id: string,
    action: () => Promise<{ success: boolean; message?: string; data?: T }>,
  ) {
    setActionError(null);
    setActionLoadingId(id);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setActionError(result.message ?? 'حدث خطأ أثناء تنفيذ العملية');
        } else {
          router.refresh();
        }
      } finally {
        setActionLoadingId(null);
      }
    });
  }

  function handleSubmit(id: string) {
    handleAction(id, () => submitBillingAction(id));
  }

  function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه المسودة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    handleAction(id, () => deleteBillingDraftAction(id));
  }

  function handleApprove(id: string) {
    handleAction(id, () => approveBillingAction(id));
  }

  function handleReopen(id: string) {
    handleAction(id, () => reopenBillingAction(id));
  }

  async function handleRejectSubmit() {
    if (!rejectingId) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setRejectionError('سبب الرفض يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }
    setRejectionError(null);
    setActionLoadingId(rejectingId);
    startTransition(async () => {
      try {
        const result = await rejectBillingAction(rejectingId, {
          rejectionReason: rejectionReason.trim(),
        });
        if (!result.success) {
          setRejectionError(result.message);
        } else {
          setRejectingId(null);
          setRejectionReason('');
          router.refresh();
        }
      } finally {
        setActionLoadingId(null);
      }
    });
  }

  async function handleCancelSubmit() {
    if (!cancellingId) return;
    setActionLoadingId(cancellingId);
    startTransition(async () => {
      try {
        const result = await cancelBillingAction(
          cancellingId,
          cancellationReason.trim() ? { cancellationReason: cancellationReason.trim() } : undefined,
        );
        if (!result.success) {
          setActionError(result.message);
        } else {
          setCancellingId(null);
          setCancellationReason('');
          router.refresh();
        }
      } finally {
        setActionLoadingId(null);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Row action visibility
  // ---------------------------------------------------------------------------

  function canEdit(b: SubcontractorBillingSummaryDTO): boolean {
    return isAccountant && b.status === 'DRAFT' && b.createdById === currentUserId;
  }

  function canSubmit(b: SubcontractorBillingSummaryDTO): boolean {
    return isAccountant && b.status === 'DRAFT' && b.createdById === currentUserId;
  }

  function canDelete(b: SubcontractorBillingSummaryDTO): boolean {
    return isAccountant && b.status === 'DRAFT' && b.createdById === currentUserId;
  }

  function canApprove(b: SubcontractorBillingSummaryDTO): boolean {
    return isManager && b.status === 'SUBMITTED';
  }

  function canReject(b: SubcontractorBillingSummaryDTO): boolean {
    return isManager && b.status === 'SUBMITTED';
  }

  function canReopen(b: SubcontractorBillingSummaryDTO): boolean {
    return isAccountant && b.status === 'REJECTED' && b.createdById === currentUserId;
  }

  function canCancel(b: SubcontractorBillingSummaryDTO): boolean {
    return isManager && (b.status === 'DRAFT' || b.status === 'SUBMITTED');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Action error */}
      {actionError && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{actionError}</span>
          <button
            type="button"
            className="ms-auto text-destructive hover:underline text-xs"
            onClick={() => setActionError(null)}
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-start">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="بحث بالمقاول، الفترة، المرجع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background ps-9 pe-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="billing-list-search"
            aria-label="بحث في المستخلصات"
          />
        </div>

        {/* Project filter */}
        {projects.length > 1 && (
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="billing-list-project-filter"
            aria-label="تصفية حسب المشروع"
          >
            <option value="ALL">كل المشاريع</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Commitment filter */}
        {commitments.length > 1 && (
          <select
            value={selectedCommitment}
            onChange={(e) => setSelectedCommitment(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="billing-list-commitment-filter"
            aria-label="تصفية حسب الالتزام"
          >
            <option value="ALL">كل الالتزامات</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.vendorName}
              </option>
            ))}
          </select>
        )}

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="billing-list-date-from"
          aria-label="من تاريخ"
          title="من تاريخ"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="billing-list-date-to"
          aria-label="إلى تاريخ"
          title="إلى تاريخ"
        />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="تصفية حسب الحالة">
        {STATUS_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedStatus === tab.id}
            onClick={() => setSelectedStatus(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedStatus === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            data-testid={`billing-filter-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <FileText className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-base font-semibold text-foreground">لا توجد مستخلصات</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || selectedStatus !== 'ALL' || selectedProject !== 'ALL'
              ? 'لا توجد نتائج تطابق معايير التصفية'
              : 'لم يتم تسجيل أي مستخلصات بعد'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table
            className="w-full text-sm"
            aria-label="قائمة المستخلصات"
          >
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                  مستخلص رقم
                </th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                  مقاول الباطن
                </th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                  الفترة
                </th>
                <th scope="col" className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground">
                  المبلغ الإجمالي
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">
                  الحالة
                </th>
                <th scope="col" className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground">
                  رصيد الالتزام
                </th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                  التاريخ
                </th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => {
                const isLoading = actionLoadingId === b.id;
                const remainingBalance = remainingBalances[b.commitmentId];

                return (
                  <tr
                    key={b.id}
                    className="hover:bg-muted/20 transition-colors"
                    data-testid={`billing-row-${b.id}`}
                  >
                    {/* Reference / ID */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/subcontractor-billings/${b.id}`}
                        className="text-primary hover:underline font-mono text-xs"
                        data-testid={`billing-link-${b.id}`}
                      >
                        {b.referenceNumber ?? b.id.slice(-8).toUpperCase()}
                      </Link>
                      {b.project && (
                        <p className="text-xs text-muted-foreground mt-0.5">{b.project.name}</p>
                      )}
                    </td>

                    {/* Subcontractor */}
                    <td className="px-4 py-3 text-foreground">
                      {b.subcontractorName}
                    </td>

                    {/* Billing Period */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.billingPeriod}
                    </td>

                    {/* Gross Amount */}
                    <td className="px-4 py-3 text-end font-mono font-semibold text-foreground">
                      {formatMoney(b.grossAmount)}
                      <span className="text-xs font-normal ms-1 text-muted-foreground">ر.س</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <BillingStatusBadge status={b.status} />
                    </td>

                    {/* Remaining Balance (display-only) */}
                    <td className="px-4 py-3 text-end font-mono text-xs text-muted-foreground">
                      {remainingBalance != null ? (
                        <span
                          className={
                            parseFloat(remainingBalance) <= 0
                              ? 'text-destructive font-semibold'
                              : ''
                          }
                        >
                          {formatMoney(remainingBalance)} ر.س
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Claim Date */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(b.claimDate)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* View — always visible */}
                        <Link
                          href={`/subcontractor-billings/${b.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          data-testid={`billing-view-button-${b.id}`}
                          aria-label={`عرض تفاصيل المستخلص ${b.id}`}
                        >
                          <Eye className="size-3" />
                          <span>عرض</span>
                        </Link>

                        {/* Edit — Accountant, DRAFT, owner */}
                        {canEdit(b) && (
                          <Link
                            href={`/subcontractor-billings/${b.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            data-testid={`billing-edit-button-${b.id}`}
                            aria-label={`تعديل المستخلص ${b.id}`}
                          >
                            <Pencil className="size-3" />
                            <span>تعديل</span>
                          </Link>
                        )}

                        {/* Submit — Accountant, DRAFT, owner */}
                        {canSubmit(b) && (
                          <button
                            type="button"
                            onClick={() => handleSubmit(b.id)}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            data-testid={`billing-submit-button-${b.id}`}
                            aria-label={`رفع المستخلص ${b.id} للاعتماد`}
                          >
                            <Send className="size-3" />
                            <span>رفع للاعتماد</span>
                          </button>
                        )}

                        {/* Delete — Accountant, DRAFT, owner */}
                        {canDelete(b) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(b.id)}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                            data-testid={`billing-delete-button-${b.id}`}
                            aria-label={`حذف المستخلص ${b.id}`}
                          >
                            <Trash2 className="size-3" />
                            <span>حذف</span>
                          </button>
                        )}

                        {/* Approve — Manager, SUBMITTED */}
                        {canApprove(b) && (
                          <button
                            type="button"
                            onClick={() => handleApprove(b.id)}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            data-testid={`billing-approve-button-${b.id}`}
                            aria-label={`اعتماد المستخلص ${b.id}`}
                          >
                            <CheckCircle2 className="size-3" />
                            <span>اعتماد</span>
                          </button>
                        )}

                        {/* Reject — Manager, SUBMITTED */}
                        {canReject(b) && (
                          <button
                            type="button"
                            onClick={() => { setRejectingId(b.id); setRejectionReason(''); setRejectionError(null); }}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                            data-testid={`billing-reject-button-${b.id}`}
                            aria-label={`رفض المستخلص ${b.id}`}
                          >
                            <XCircle className="size-3" />
                            <span>رفض</span>
                          </button>
                        )}

                        {/* Reopen — Accountant, REJECTED, owner */}
                        {canReopen(b) && (
                          <button
                            type="button"
                            onClick={() => handleReopen(b.id)}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                            data-testid={`billing-reopen-button-${b.id}`}
                            aria-label={`إعادة فتح المستخلص ${b.id}`}
                          >
                            <RotateCcw className="size-3" />
                            <span>إعادة فتح</span>
                          </button>
                        )}

                        {/* Cancel — Manager, DRAFT or SUBMITTED */}
                        {canCancel(b) && (
                          <button
                            type="button"
                            onClick={() => { setCancellingId(b.id); setCancellationReason(''); }}
                            disabled={isLoading || isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition-colors"
                            data-testid={`billing-cancel-button-${b.id}`}
                            aria-label={`إلغاء المستخلص ${b.id}`}
                          >
                            <XCircle className="size-3" />
                            <span>إلغاء</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          data-testid="billing-reject-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="reject-dialog-title" className="text-lg font-bold text-foreground mb-4">
              رفض المستخلص مع سبب
            </h2>

            {rejectionError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {rejectionError}
              </div>
            )}

            <label htmlFor="rejection-reason-input" className="block text-sm font-semibold text-foreground mb-1.5">
              سبب الرفض <span className="text-destructive">*</span>
            </label>
            <textarea
              id="rejection-reason-input"
              rows={4}
              placeholder="يرجى توضيح سبب الرفض..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              data-testid="rejection-reason-input"
              aria-required="true"
            />
            <p className="mt-1 text-xs text-muted-foreground">{rejectionReason.length} / 500</p>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setRejectingId(null); setRejectionReason(''); setRejectionError(null); }}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="rejection-cancel-button"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRejectSubmit}
                disabled={isPending}
                className="rounded-md bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                data-testid="rejection-submit-button"
              >
                {isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancellingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          data-testid="billing-cancel-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="cancel-dialog-title" className="text-lg font-bold text-foreground mb-4">
              إلغاء المستخلص
            </h2>

            <label htmlFor="cancellation-reason-input" className="block text-sm font-semibold text-foreground mb-1.5">
              سبب الإلغاء
              <span className="ms-1 text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            <textarea
              id="cancellation-reason-input"
              rows={3}
              placeholder="يمكن ذكر سبب الإلغاء هنا (اختياري)..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              data-testid="cancellation-reason-input"
            />

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setCancellingId(null); setCancellationReason(''); }}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="cancel-dialog-dismiss"
              >
                رجوع
              </button>
              <button
                type="button"
                onClick={handleCancelSubmit}
                disabled={isPending}
                className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                data-testid="cancel-confirm-button"
              >
                {isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEngineer && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          وضع القراءة فقط — المهندسون لا يملكون صلاحيات تعديل المستخلصات.
        </p>
      )}
    </div>
  );
}
