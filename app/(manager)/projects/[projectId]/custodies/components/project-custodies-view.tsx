'use client';

/**
 * app/(manager)/projects/[projectId]/custodies/components/project-custodies-view.tsx
 *
 * Management oversight and approval view for project custodies.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CustodyStatus } from '@prisma/client';

import {
  approveCustodyAction,
  rejectCustodyAction,
  cancelCustodyAction,
  closeCustodyAction,
} from '@/app/custodies/actions';
import { CustodyStatusBadge } from '@/app/custodies/components/custody-status-badge';
import type { ProjectCustodiesOverviewDTO, CustodySummaryDTO } from '@/lib/custodies/types';

interface ProjectCustodiesViewProps {
  initialOverview: ProjectCustodiesOverviewDTO;
  currentUserId: string;
}

export function ProjectCustodiesView({
  initialOverview,
  currentUserId,
}: ProjectCustodiesViewProps) {
  const router = useRouter();
  const [overview, setOverview] = useState<ProjectCustodiesOverviewDTO>(initialOverview);
  const [rejectingCustody, setRejectingCustody] = useState<CustodySummaryDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancellingCustody, setCancellingCustody] = useState<CustodySummaryDTO | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleApprove = (custodyId: string) => {
    if (!confirm('هل أنت متأكد من اعتماد طلب العهدة النقدية؟')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await approveCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setOverview({
        ...overview,
        custodies: overview.custodies.map((c) => (c.id === custodyId ? res.data : c)),
      });
      router.refresh();
    });
  };

  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingCustody) return;
    setActionError(null);
    startTransition(async () => {
      const res = await rejectCustodyAction({
        id: rejectingCustody.id,
        rejectionReason,
      });
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setOverview({
        ...overview,
        custodies: overview.custodies.map((c) => (c.id === rejectingCustody.id ? res.data : c)),
      });
      setRejectingCustody(null);
      setRejectionReason('');
      router.refresh();
    });
  };

  const handleCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingCustody) return;
    setActionError(null);
    startTransition(async () => {
      const res = await cancelCustodyAction({
        id: cancellingCustody.id,
        cancellationReason,
      });
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setOverview({
        ...overview,
        custodies: overview.custodies.map((c) => (c.id === cancellingCustody.id ? res.data : c)),
      });
      setCancellingCustody(null);
      setCancellationReason('');
      router.refresh();
    });
  };

  const handleClose = (custodyId: string) => {
    if (!confirm('هل تأكدت من مراجعة تسوية العهدة بالكامل وترغب في إغلاقها وأرشفتها نهائياً؟')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await closeCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setOverview({
        ...overview,
        custodies: overview.custodies.map((c) => (c.id === custodyId ? res.data : c)),
      });
      router.refresh();
    });
  };

  const pendingCustodies = overview.custodies.filter((c) => c.status === CustodyStatus.SUBMITTED);

  return (
    <div className="space-y-6" dir="rtl">
      {actionError && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30">
          {actionError}
        </div>
      )}

      {/* 4-Pillar Financial Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">الموازنة المعتمدة</p>
          <p className="mt-1 text-lg font-bold text-foreground">{parseFloat(overview.totalAuthorizedBudget).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">سقف الموازنة</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">الالتزامات المعتمدة</p>
          <p className="mt-1 text-lg font-bold text-foreground">{parseFloat(overview.totalApprovedCommitments).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">أوامر توريد وعقود</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">المصروفات الفعلية</p>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{parseFloat(overview.totalApprovedExpenses).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">مباشرة ومسواة</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">العهد القائمة (الميدان)</p>
          <p className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{parseFloat(overview.totalOutstandingCustodies).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">سيولة غير مسواة</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">إجمالي التعرض المالي</p>
          <p className="mt-1 text-lg font-bold text-primary">{parseFloat(overview.totalActiveExposure).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">الالتزام + الصرف + العهد</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">الرصيد المتاح</p>
          <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">{parseFloat(overview.totalAvailableBalance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-muted-foreground">للارتباطات الجديدة</span>
        </div>
      </div>

      {/* Pending Approval Section */}
      {pendingCustodies.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
            <div>
              <h2 className="text-base font-bold text-amber-900 dark:text-amber-300">
                طلبات عهد نقدية بانتظار الاعتماد ({pendingCustodies.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                طلبات مقدمة من المهندسين/المحاسبين تتطلب مراجعة واعتماد المدير التنفيذي
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-amber-500/10">
            {pendingCustodies.map((c) => (
              <div key={c.id} className="flex flex-col justify-between gap-3 py-3 md:flex-row md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{c.code}</span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                      مبلغ الطلب: {parseFloat(c.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{c.purpose}</p>
                  <p className="text-xs text-muted-foreground">
                    أمين العهدة: <strong className="text-foreground">{c.custodian.name}</strong> |
                    البند: <strong className="text-foreground">{c.budgetLine?.category} - {c.budgetLine?.description}</strong> |
                    مقدم الطلب: {c.submittedBy?.name}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(c.id)}
                    disabled={isPending || c.createdById === currentUserId || c.custodianUserId === currentUserId}
                    className="rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                    data-testid={`approve-custody-${c.id}`}
                  >
                    اعتماد الطلب
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingCustody(c)}
                    disabled={isPending || c.createdById === currentUserId || c.custodianUserId === currentUserId}
                    className="rounded border border-destructive/30 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    رفض الطلب
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget Lines Exposure Table */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold text-foreground">توزيع تعرّض العهد والالتزامات على بنود الموازنة</h2>
        <p className="text-xs text-muted-foreground mb-4">
          يبيّن الجدول سقف كل بند وما تم صرفه فعلياً وما هو محجوز كعهد نقدية قائمة في الميدان دون احتساب مزدوج
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">البند</th>
                <th className="p-2.5 font-medium">الموازنة</th>
                <th className="p-2.5 font-medium">الالتزامات</th>
                <th className="p-2.5 font-medium">المصروف الفعلي</th>
                <th className="p-2.5 font-medium">العهد القائمة</th>
                <th className="p-2.5 font-medium">إجمالي التعرض</th>
                <th className="p-2.5 font-medium">الرصيد المتاح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.lines.map((l) => (
                <tr key={l.budgetLineId} className="hover:bg-muted/30">
                  <td className="p-2.5 font-medium text-foreground">
                    <div>{l.category}</div>
                    <div className="text-[11px] text-muted-foreground">{l.description}</div>
                  </td>
                  <td className="p-2.5 font-mono">{l.authorizedAmount} ر.س</td>
                  <td className="p-2.5 font-mono text-muted-foreground">{l.approvedCommitments} ر.س</td>
                  <td className="p-2.5 font-mono text-emerald-600 dark:text-emerald-400">{l.approvedExpenses} ر.س</td>
                  <td className="p-2.5 font-mono text-amber-600 dark:text-amber-400">{l.outstandingCustodies} ر.س</td>
                  <td className="p-2.5 font-mono font-semibold text-primary">{l.totalActiveExposure} ر.س</td>
                  <td className="p-2.5 font-mono font-bold text-foreground">{l.availableBalance} ر.س</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Custodies Registry */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-foreground">سجل العهد النقدية للمشروع</h2>

        {overview.custodies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs">
            لا توجد عهد مسجلة لهذا المشروع بعد.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {overview.custodies.map((c) => (
              <div key={c.id} className="flex flex-col justify-between gap-3 py-3 md:flex-row md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{c.code}</span>
                    <CustodyStatusBadge status={c.status} />
                    <span className="text-xs text-muted-foreground">أمين العهدة: {c.custodian.name}</span>
                  </div>
                  <p className="text-sm text-foreground">{c.purpose}</p>
                  <p className="text-xs text-muted-foreground">
                    البند: {c.budgetLine?.category} - {c.budgetLine?.description} |
                    المبلغ: <strong className="text-foreground">{c.amount} ر.س</strong> |
                    المسوى: {c.settledExpensesAmount} ر.س | المسترجع: {c.cashReturnedAmount} ر.س |
                    المتبقي: <strong className="text-amber-600 dark:text-amber-400">{c.remainingBalance} ر.س</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {c.status === CustodyStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => setCancellingCustody(c)}
                      disabled={isPending}
                      className="rounded border border-rose-500/30 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    >
                      إلغاء الطلب المعتمد
                    </button>
                  )}

                  {c.status === CustodyStatus.SETTLED && (
                    <button
                      type="button"
                      onClick={() => handleClose(c.id)}
                      disabled={isPending}
                      className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900"
                    >
                      إغلاق وأرشفة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      {rejectingCustody && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h3 className="text-base font-bold text-destructive">رفض طلب العهدة النقدية</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              العهدة: {rejectingCustody.code} | المبلغ: {rejectingCustody.amount} ر.س
            </p>

            <form onSubmit={handleReject} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground">سبب الرفض الإداري</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="بيان سبب رفض طلب العهدة..."
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingCustody(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingCustody && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h3 className="text-base font-bold text-destructive">إلغاء طلب العهدة المعتمد</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              العهدة: {cancellingCustody.code} | المبلغ: {cancellingCustody.amount} ر.س
            </p>

            <form onSubmit={handleCancel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground">سبب الإلغاء الإداري</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="سبب إلغاء العهدة المعتمدة قبل الصرف المالي..."
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingCustody(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء النهائي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
