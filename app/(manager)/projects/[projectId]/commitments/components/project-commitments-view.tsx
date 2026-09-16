'use client';

import { useState } from 'react';
import {
  FileSignature,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Calendar,
  Layers,
  ShieldAlert,
} from 'lucide-react';

import type {
  ProjectCommitmentsOverviewDTO,
  CommitmentSummaryDTO,
} from '@/lib/commitments';
import { CommitmentStatusBadge } from '@/app/commitments/components/commitment-status-badge';
import {
  approveCommitmentAction,
  rejectCommitmentAction,
} from '@/app/commitments/actions';

interface ProjectCommitmentsViewProps {
  initialOverview: ProjectCommitmentsOverviewDTO;
  currentUserId: string;
}

function recalculateOverview(
  prev: ProjectCommitmentsOverviewDTO,
  updatedCommitments: CommitmentSummaryDTO[],
): ProjectCommitmentsOverviewDTO {
  const updatedLines = prev.lines.map((line) => {
    const lineCommitments = updatedCommitments.filter(
      (c) => c.budgetLineId === line.budgetLineId,
    );

    const approvedCommNum = lineCommitments
      .filter((c) => c.status === 'APPROVED')
      .reduce((sum, c) => sum + parseFloat(c.amount), 0);

    const pendingCommNum = lineCommitments
      .filter((c) => c.status === 'SUBMITTED')
      .reduce((sum, c) => sum + parseFloat(c.amount), 0);

    const authNum = parseFloat(line.authorizedAmount);
    const approvedExpNum = parseFloat(line.approvedExpenses);
    const pendingExpNum = parseFloat(line.pendingExpenseExposure);

    const totalExposureNum = approvedExpNum + approvedCommNum;
    const availableBalanceNum = authNum - totalExposureNum;
    const totalPendingNum = pendingCommNum + pendingExpNum;
    const projectedBalanceNum = availableBalanceNum - totalPendingNum;

    return {
      ...line,
      approvedCommitments: approvedCommNum.toFixed(2),
      totalExposure: totalExposureNum.toFixed(2),
      availableBalance: availableBalanceNum.toFixed(2),
      pendingCommitmentExposure: pendingCommNum.toFixed(2),
      totalPendingExposure: totalPendingNum.toFixed(2),
      projectedBalance: projectedBalanceNum.toFixed(2),
    };
  });

  const totalApprovedCommNum = updatedCommitments
    .filter((c) => c.status === 'APPROVED')
    .reduce((sum, c) => sum + parseFloat(c.amount), 0);

  const totalPendingCommNum = updatedCommitments
    .filter((c) => c.status === 'SUBMITTED')
    .reduce((sum, c) => sum + parseFloat(c.amount), 0);

  const totalAuthNum = parseFloat(prev.totalAuthorizedBudget);
  const totalApprovedExpNum = parseFloat(prev.totalApprovedExpenses);
  const totalPendingExpNum = parseFloat(prev.totalPendingExpenseExposure);

  const totalExposureNum = totalApprovedExpNum + totalApprovedCommNum;
  const totalAvailableNum = totalAuthNum - totalExposureNum;
  const totalPendingNum = totalPendingCommNum + totalPendingExpNum;
  const totalProjectedNum = totalAvailableNum - totalPendingNum;

  return {
    ...prev,
    totalApprovedCommitments: totalApprovedCommNum.toFixed(2),
    totalExposure: totalExposureNum.toFixed(2),
    totalAvailableBalance: totalAvailableNum.toFixed(2),
    totalPendingCommitmentExposure: totalPendingCommNum.toFixed(2),
    totalPendingExposure: totalPendingNum.toFixed(2),
    totalProjectedBalance: totalProjectedNum.toFixed(2),
    lines: updatedLines,
    commitments: updatedCommitments,
  };
}

export function ProjectCommitmentsView({
  initialOverview,
  currentUserId,
}: ProjectCommitmentsViewProps) {
  const [overview, setOverview] = useState<ProjectCommitmentsOverviewDTO>(initialOverview);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reject modal state
  const [rejectingCommitment, setRejectingCommitment] = useState<CommitmentSummaryDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Approve dialog state
  const [approvingCommitment, setApprovingCommitment] = useState<CommitmentSummaryDTO | null>(null);

  // Filtered commitments
  const filteredCommitments = overview.commitments.filter((c) => {
    if (selectedStatus !== 'ALL' && c.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.vendorName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.referenceNumber?.toLowerCase().includes(q) ?? false) ||
        c.createdBy.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleApprove(commitmentId: string) {
    setError(null);
    setActionLoadingId(commitmentId);
    try {
      const result = await approveCommitmentAction(commitmentId);
      if (!result.success) {
        setError(result.message);
        return;
      }

      // Update state locally with reactive recalculation
      setOverview((prev) => {
        const updatedCommitments = prev.commitments.map((c) =>
          c.id === commitmentId ? result.data : c,
        );
        return recalculateOverview(prev, updatedCommitments);
      });
      setApprovingCommitment(null);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject() {
    if (!rejectingCommitment) return;
    setRejectError(null);

    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setRejectError('سبب الرفض يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }

    setActionLoadingId(rejectingCommitment.id);
    try {
      const result = await rejectCommitmentAction(rejectingCommitment.id, {
        rejectionReason: rejectionReason.trim(),
      });

      if (!result.success) {
        setRejectError(result.message);
        return;
      }

      setOverview((prev) => {
        const updatedCommitments = prev.commitments.map((c) =>
          c.id === rejectingCommitment.id ? result.data : c,
        );
        return recalculateOverview(prev, updatedCommitments);
      });

      setRejectingCommitment(null);
      setRejectionReason('');
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Financial Exposure Metric Cards (Mandatory Correction 1) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Authorized Budget */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="card-authorized-budget">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>الموازنة المعتمدة</span>
            <DollarSign className="size-4 text-muted-foreground/60" />
          </div>
          <div className="text-xl font-bold font-mono text-foreground" data-testid="total-authorized-budget">
            {overview.totalAuthorizedBudget} <span className="text-xs font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">السقف المالي الكلي المعتمد</p>
        </div>

        {/* Total Exposure = Approved Expenses + Approved Commitments */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm" data-testid="card-total-exposure">
          <div className="flex items-center justify-between text-xs text-primary font-medium mb-1">
            <span>إجمالي التعرض المالي</span>
            <FileSignature className="size-4 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono text-primary" data-testid="total-exposure">
            {overview.totalExposure} <span className="text-xs font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            منفق فعلي: {overview.totalApprovedExpenses} + ارتباطات: {overview.totalApprovedCommitments}
          </p>
        </div>

        {/* Available Balance */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm" data-testid="card-available-balance">
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1">
            <span>الرصيد المتاح للارتباط</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400" data-testid="total-available-balance">
            {overview.totalAvailableBalance} <span className="text-xs font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">المتبقي من سقف الموازنة</p>
        </div>

        {/* Total Pending Exposure */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm" data-testid="card-pending-exposure">
          <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">
            <span>الطلبات المعلقة للاعتماد</span>
            <Clock className="size-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400" data-testid="total-pending-exposure">
            {overview.totalPendingExposure} <span className="text-xs font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            رصيد تقديري بعد المعلق: <span data-testid="total-projected-balance">{overview.totalProjectedBalance}</span> ر.س
          </p>
        </div>
      </div>

      {/* Budget Lines Breakdown Table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">تحليل بنود الموازنة والتعرض المالي</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {overview.lines.length} بنود موازنة معتمدة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="py-2.5 px-3 text-start font-semibold">بند الموازنة</th>
                <th className="py-2.5 px-3 text-end font-semibold">السقف المعتمد</th>
                <th className="py-2.5 px-3 text-end font-semibold">المصروف الفعلي</th>
                <th className="py-2.5 px-3 text-end font-semibold">ارتباطات معتمدة</th>
                <th className="py-2.5 px-3 text-end font-semibold">إجمالي التعرض</th>
                <th className="py-2.5 px-3 text-end font-semibold">الرصيد المتاح</th>
                <th className="py-2.5 px-3 text-end font-semibold">معلق (شراء+صرف)</th>
                <th className="py-2.5 px-3 text-end font-semibold">الرصيد التقديري</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.lines.map((line) => (
                <tr key={line.budgetLineId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-foreground">{line.description}</div>
                    <div className="text-[11px] text-muted-foreground">{line.category}</div>
                  </td>
                  <td className="py-3 px-3 text-end font-mono font-medium">{line.authorizedAmount}</td>
                  <td className="py-3 px-3 text-end font-mono text-muted-foreground">{line.approvedExpenses}</td>
                  <td className="py-3 px-3 text-end font-mono text-primary font-medium">{line.approvedCommitments}</td>
                  <td className="py-3 px-3 text-end font-mono font-bold text-foreground">{line.totalExposure}</td>
                  <td className="py-3 px-3 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {line.availableBalance}
                  </td>
                  <td className="py-3 px-3 text-end font-mono text-blue-600 dark:text-blue-400">
                    {line.totalPendingExposure}
                  </td>
                  <td className="py-3 px-3 text-end font-mono text-muted-foreground">{line.projectedBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالمورد، البيان، الرقم المرجعي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background ps-9 pe-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="manager-commitments-search-input"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist">
          {[
            { id: 'ALL', label: 'الكل' },
            { id: 'SUBMITTED', label: 'قيد الاعتماد' },
            { id: 'APPROVED', label: 'المعتمدة' },
            { id: 'REJECTED', label: 'المرفوضة' },
            { id: 'DRAFT', label: 'المسودات' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatus(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedStatus === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid={`manager-filter-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Commitments Table / Cards */}
      {filteredCommitments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <FileSignature className="size-12 text-muted-foreground/50 mb-3" />
          <p className="text-base font-semibold text-foreground">لا توجد ارتباطات مالية مطابقة</p>
          <p className="text-sm text-muted-foreground mt-1">
            لم يتم العثور على أي ارتباطات تفي بمعايير البحث والتصفية
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCommitments.map((c) => {
            const isSelfSubmission = c.createdById === currentUserId || c.submittedById === currentUserId;

            return (
              <div
                key={c.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                data-testid={`manager-commitment-card-${c.id}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <CommitmentStatusBadge status={c.status} />
                    <span className="text-xs font-mono text-muted-foreground">
                      {c.referenceNumber ? `#${c.referenceNumber}` : 'بدون مرجع'}
                    </span>
                  </div>

                  <h3 className="font-bold text-foreground text-base line-clamp-1">{c.vendorName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>

                  <div className="space-y-1 py-3 my-2 border-y border-border text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block size-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="line-clamp-1">بند: {c.budgetLine?.description}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 shrink-0" />
                      <span>{new Date(c.commitmentDate).toLocaleDateString('ar-SA')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-medium">مُعد الطلب:</span>
                      <span>{c.createdBy.name}</span>
                    </div>
                  </div>

                  {c.rejectionReason && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 my-2 text-xs text-destructive">
                      <span className="font-bold">سبب الرفض: </span>
                      <span>{c.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between pt-2">
                    <span className="text-xs text-muted-foreground">المبلغ المطلوب:</span>
                    <span className="text-lg font-bold font-mono text-foreground">
                      {c.amount} <span className="text-xs font-normal">ر.س</span>
                    </span>
                  </div>

                  {/* Manager Action Area */}
                  {c.status === 'SUBMITTED' && (
                    <div className="mt-4 pt-3 border-t border-border">
                      {isSelfSubmission ? (
                        <div
                          className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md border border-amber-200 dark:border-amber-900"
                          data-testid="self-approval-warning"
                        >
                          <ShieldAlert className="size-4 shrink-0" />
                          <span>فصل المهام: لا يمكنك اعتماد التزام قمت بإعداده أو رفعه بنفسك</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setApprovingCommitment(c)}
                            disabled={actionLoadingId === c.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            data-testid={`approve-commitment-button-${c.id}`}
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span>اعتماد</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingCommitment(c);
                              setRejectionReason('');
                              setRejectError(null);
                            }}
                            disabled={actionLoadingId === c.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                            data-testid={`reject-commitment-button-${c.id}`}
                          >
                            <XCircle className="size-3.5" />
                            <span>رفض</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Approval */}
      {approvingCommitment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="approve-confirmation-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3 text-emerald-600 mb-3">
              <CheckCircle2 className="size-6 shrink-0" />
              <h3 className="text-lg font-bold text-foreground">تأكيد اعتماد الارتباط المالي</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              أنت على وشك حجز واعتماد التزام مالي بقيمة{' '}
              <strong className="text-foreground font-mono">{approvingCommitment.amount} ر.س</strong> لصالح{' '}
              <strong className="text-foreground">{approvingCommitment.vendorName}</strong>.
              هذا الإجراء سيقفل جزءاً من رصيد بند الموازنة بصورة دائمة ولا يمكن التراجع عنه.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setApprovingCommitment(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="cancel-approval-button"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleApprove(approvingCommitment.id)}
                disabled={actionLoadingId === approvingCommitment.id}
                className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                data-testid="confirm-approval-button"
              >
                {actionLoadingId === approvingCommitment.id ? 'جاري الاعتماد...' : 'تأكيد الاعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal with Mandatory Reason */}
      {rejectingCommitment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="reject-confirmation-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3 text-destructive mb-3">
              <XCircle className="size-6 shrink-0" />
              <h3 className="text-lg font-bold text-foreground">رفض طلب الارتباط المالي</h3>
            </div>

            {rejectError && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {rejectError}
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-3">
              يرجى تدوين سبب الرفض لتوضيح دوافع القرار لمسؤول المشتريات:
            </p>

            <textarea
              rows={3}
              placeholder="سبب الرفض الإلزامي (مثال: عدم ملاءمة السعر، استنفاذ البند، أو نقص عروض الأسعار)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary"
              data-testid="rejection-reason-input"
            />

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setRejectingCommitment(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="cancel-rejection-button"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoadingId === rejectingCommitment.id}
                className="rounded-md bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                data-testid="confirm-rejection-button"
              >
                {actionLoadingId === rejectingCommitment.id ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
