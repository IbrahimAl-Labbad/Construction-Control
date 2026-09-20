'use client';

/**
 * app/custodies/components/user-custodies-view.tsx
 *
 * Client view component for the field and operational Custodies hub.
 * Supports: Requesting advances, editing drafts, submitting, disbursing cash, recording cash return, viewing balances.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CustodyStatus } from '@prisma/client';

import {
  createCustodyAction,
  deleteCustodyAction,
  submitCustodyAction,
  reopenCustodyAction,
  issueCustodyAction,
  recordCashReturnAction,
  closeCustodyAction,
  cancelCustodyAction,
} from '../actions';
import type { CustodyFormDataDTO } from '@/lib/custodies';
import type { CustodySummaryDTO } from '@/lib/custodies/types';
import { CustodyStatusBadge } from './custody-status-badge';

interface UserCustodiesViewProps {
  initialCustodies: CustodySummaryDTO[];
  formData: CustodyFormDataDTO;
  canCreate: boolean;
  isAccountant: boolean;
  isManager: boolean;
  currentUserId: string;
}

export function UserCustodiesView({
  initialCustodies,
  formData,
  canCreate,
  isAccountant,
  isManager,
  currentUserId,
}: UserCustodiesViewProps) {
  const router = useRouter();
  const [custodies, setCustodies] = useState<CustodySummaryDTO[]>(initialCustodies);
  const [selectedTab, setSelectedTab] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'SETTLED' | 'DRAFTS'>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReturnCashOpen, setIsReturnCashOpen] = useState<CustodySummaryDTO | null>(null);
  const [isCancelOpen, setIsCancelOpen] = useState<CustodySummaryDTO | null>(null);

  // Form states
  const [selectedProjectId, setSelectedProjectId] = useState(formData.projects[0]?.id ?? '');
  const [selectedBudgetLineId, setSelectedBudgetLineId] = useState(formData.projects[0]?.lines[0]?.id ?? '');
  const [selectedCustodianId, setSelectedCustodianId] = useState(formData.custodians[0]?.id ?? currentUserId);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedSettlementDate, setExpectedSettlementDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Action states
  const [cashReturnAmount, setCashReturnAmount] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const selectedProject = formData.projects.find((p) => p.id === selectedProjectId);

  // Calculate totals
  const totalIssued = custodies
    .filter((c) => c.status !== CustodyStatus.DRAFT && c.status !== CustodyStatus.SUBMITTED && c.status !== CustodyStatus.CANCELLED && c.status !== CustodyStatus.REJECTED)
    .reduce((acc, c) => acc + parseFloat(c.amount), 0);

  const totalSettled = custodies.reduce((acc, c) => acc + parseFloat(c.settledExpensesAmount), 0);
  const totalReturned = custodies.reduce((acc, c) => acc + parseFloat(c.cashReturnedAmount), 0);
  const totalOutstanding = custodies
    .filter((c) => c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED)
    .reduce((acc, c) => acc + parseFloat(c.remainingBalance), 0);

  // Filtered custodies
  const filteredCustodies = custodies.filter((c) => {
    if (selectedTab === 'ACTIVE') return c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED;
    if (selectedTab === 'PENDING') return c.status === CustodyStatus.SUBMITTED || c.status === CustodyStatus.APPROVED;
    if (selectedTab === 'SETTLED') return c.status === CustodyStatus.SETTLED || c.status === CustodyStatus.CLOSED;
    if (selectedTab === 'DRAFTS') return c.status === CustodyStatus.DRAFT || c.status === CustodyStatus.REJECTED;
    return true;
  });

  const handleCreateCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const res = await createCustodyAction({
        projectId: selectedProjectId,
        budgetLineId: selectedBudgetLineId,
        custodianUserId: selectedCustodianId,
        amount,
        purpose,
        expectedSettlementDate: expectedSettlementDate || undefined,
      });

      if (!res.success) {
        setFormError(res.message);
        return;
      }

      setCustodies([res.data, ...custodies]);
      setIsCreateOpen(false);
      setAmount('');
      setPurpose('');
      setExpectedSettlementDate('');
      router.refresh();
    });
  };

  const handleSubmit = (custodyId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await submitCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === custodyId ? res.data : c)));
      router.refresh();
    });
  };

  const handleDelete = (custodyId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المسودة؟')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await deleteCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.filter((c) => c.id !== custodyId));
      router.refresh();
    });
  };

  const handleReopen = (custodyId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await reopenCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === custodyId ? res.data : c)));
      router.refresh();
    });
  };

  const handleIssue = (custodyId: string) => {
    if (!confirm('هل تأكدت من صرف وتسليم المبلغ النقدي لأمين العهدة؟')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await issueCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === custodyId ? res.data : c)));
      router.refresh();
    });
  };

  const handleReturnCash = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReturnCashOpen) return;
    setActionError(null);
    startTransition(async () => {
      const res = await recordCashReturnAction({
        id: isReturnCashOpen.id,
        amount: cashReturnAmount,
      });
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === isReturnCashOpen.id ? res.data : c)));
      setIsReturnCashOpen(null);
      setCashReturnAmount('');
      router.refresh();
    });
  };

  const handleCancelCustody = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCancelOpen) return;
    setActionError(null);
    startTransition(async () => {
      const res = await cancelCustodyAction({
        id: isCancelOpen.id,
        cancellationReason,
      });
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === isCancelOpen.id ? res.data : c)));
      setIsCancelOpen(null);
      setCancellationReason('');
      router.refresh();
    });
  };

  const handleCloseCustody = (custodyId: string) => {
    if (!confirm('هل أنت متأكد من الإغلاق الإداري والأرشفة النهائية للعهدة؟')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await closeCustodyAction(custodyId);
      if (!res.success) {
        setActionError(res.message);
        return;
      }
      setCustodies(custodies.map((c) => (c.id === custodyId ? res.data : c)));
      router.refresh();
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            العهد النقدية المؤقتة وتصفيتها
          </h1>
          <p className="text-sm text-muted-foreground">
            إدارة ومتابعة السلف النقدية التشغيلية في الميدان وتصفيتها عبر الفواتير واسترجاع الفائض
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="request-custody-button"
          >
            + طلب عهدة جديدة
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30">
          {actionError}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">إجمالي العهد المنصرفة</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalIssued.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س</p>
          <span className="text-[11px] text-muted-foreground">مبالغ خرجت من الشركة</span>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">المصروفات المسواة</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalSettled.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س</p>
          <span className="text-[11px] text-muted-foreground">فواتير معتمدة أصولاً</span>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">الفائض المسترجع</p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{totalReturned.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س</p>
          <span className="text-[11px] text-muted-foreground">نقد استرجع للشركة</span>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">الرصيد المتبقي بالميدان</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{totalOutstanding.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س</p>
          <span className="text-[11px] text-muted-foreground">في ذمة الموظفين حالياً</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          type="button"
          onClick={() => setSelectedTab('ALL')}
          className={`px-4 py-2 border-b-2 -mb-px transition-colors ${selectedTab === 'ALL' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          الكل ({custodies.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('ACTIVE')}
          className={`px-4 py-2 border-b-2 -mb-px transition-colors ${selectedTab === 'ACTIVE' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          قائمة بالميدان ({custodies.filter((c) => c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED).length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('PENDING')}
          className={`px-4 py-2 border-b-2 -mb-px transition-colors ${selectedTab === 'PENDING' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          قيد الاعتماد / الصرف ({custodies.filter((c) => c.status === CustodyStatus.SUBMITTED || c.status === CustodyStatus.APPROVED).length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('SETTLED')}
          className={`px-4 py-2 border-b-2 -mb-px transition-colors ${selectedTab === 'SETTLED' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          مسواة ومغلقة ({custodies.filter((c) => c.status === CustodyStatus.SETTLED || c.status === CustodyStatus.CLOSED).length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('DRAFTS')}
          className={`px-4 py-2 border-b-2 -mb-px transition-colors ${selectedTab === 'DRAFTS' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          المسودات والمرفوضة ({custodies.filter((c) => c.status === CustodyStatus.DRAFT || c.status === CustodyStatus.REJECTED).length})
        </button>
      </div>

      {/* Custodies List */}
      <div className="space-y-4">
        {filteredCustodies.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            لا توجد عهد نقدية مطابقة للتصنيف المحدد.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredCustodies.map((c) => (
              <div
                key={c.id}
                className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md md:flex-row md:items-center"
                data-testid={`custody-item-${c.id}`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-primary">{c.code}</span>
                    <CustodyStatusBadge status={c.status} />
                    <span className="text-xs text-muted-foreground">
                      المشروع: {c.project?.name ?? c.projectId}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-foreground">{c.purpose}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>أمين العهدة: <strong className="text-foreground">{c.custodian.name}</strong></span>
                    <span>البند: <strong className="text-foreground">{c.budgetLine?.category} - {c.budgetLine?.description}</strong></span>
                    {c.expectedSettlementDate && (
                      <span>تاريخ التسوية المتوقع: {new Date(c.expectedSettlementDate).toLocaleDateString('ar-SA')}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3 border-t pt-3 md:items-end md:border-t-0 md:pt-0">
                  <div className="text-right">
                    <div className="text-lg font-bold text-foreground">
                      {parseFloat(c.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
                    </div>
                    <div className="text-xs text-muted-foreground">
                      مسوى: {c.settledExpensesAmount} ر.س | مسترجع: {c.cashReturnedAmount} ر.س
                    </div>
                    {(c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED) && (
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        المتبقي: {c.remainingBalance} ر.س
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {c.status === CustodyStatus.DRAFT && c.createdById === currentUserId && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSubmit(c.id)}
                          disabled={isPending}
                          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          تقديم للاعتماد
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={isPending}
                          className="rounded border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          حذف
                        </button>
                      </>
                    )}

                    {c.status === CustodyStatus.REJECTED && c.createdById === currentUserId && (
                      <button
                        type="button"
                        onClick={() => handleReopen(c.id)}
                        disabled={isPending}
                        className="rounded bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                      >
                        إعادة فتح وتعديل
                      </button>
                    )}

                    {c.status === CustodyStatus.APPROVED && isAccountant && (
                      <button
                        type="button"
                        onClick={() => handleIssue(c.id)}
                        disabled={isPending}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        data-testid={`issue-custody-${c.id}`}
                      >
                        تسليم وصرف العهدة نقداً
                      </button>
                    )}

                    {c.status === CustodyStatus.APPROVED && isManager && (
                      <button
                        type="button"
                        onClick={() => setIsCancelOpen(c)}
                        disabled={isPending}
                        className="rounded border border-rose-500/30 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      >
                        إلغاء الطلب
                      </button>
                    )}

                    {(c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED) && isAccountant && (
                      <button
                        type="button"
                        onClick={() => setIsReturnCashOpen(c)}
                        disabled={isPending || parseFloat(c.cashReturnedAmount) > 0}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        تسجيل استرجاع فائض
                      </button>
                    )}

                    {c.status === CustodyStatus.SETTLED && isManager && (
                      <button
                        type="button"
                        onClick={() => handleCloseCustody(c.id)}
                        disabled={isPending}
                        className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900"
                      >
                        إغلاق نهائي وأرشفة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Custody Request Modal Dialog */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-bold text-foreground">طلب سلفة / عهدة نقدية جديدة</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              سلفة نقدية مؤقتة تُربط ببند موازنة محدد وتكون في ذمة الموظف المسؤول حتى تصفيتها
            </p>

            {formError && (
              <div className="mt-3 rounded bg-destructive/15 p-2 text-xs text-destructive border border-destructive/30">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCustody} className="mt-4 space-y-4">
              <div>
                <label htmlFor="custody-project" className="block text-xs font-medium text-foreground">المشروع</label>
                <select
                  id="custody-project"
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    const proj = formData.projects.find((p) => p.id === e.target.value);
                    if (proj && proj.lines[0]) {
                      setSelectedBudgetLineId(proj.lines[0].id);
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {formData.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="custody-budgetline" className="block text-xs font-medium text-foreground">بند الموازنة المستهدف</label>
                <select
                  id="custody-budgetline"
                  value={selectedBudgetLineId}
                  onChange={(e) => setSelectedBudgetLineId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {selectedProject?.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.category} - {l.description} (المتاح: {l.amount} ر.س)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="custody-custodian" className="block text-xs font-medium text-foreground">أمين العهدة المسؤول</label>
                <select
                  id="custody-custodian"
                  value={selectedCustodianId}
                  onChange={(e) => setSelectedCustodianId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {formData.custodians.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="custody-amount" className="block text-xs font-medium text-foreground">المبلغ المطلوب (ر.س)</label>
                  <input
                    id="custody-amount"
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="مثال: 5000.00"
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="custody-expected-date" className="block text-xs font-medium text-foreground">تاريخ التسوية المتوقع</label>
                  <input
                    id="custody-expected-date"
                    type="date"
                    value={expectedSettlementDate}
                    onChange={(e) => setExpectedSettlementDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="custody-purpose" className="block text-xs font-medium text-foreground">الغرض التشغيلي والمبرر</label>
                <textarea
                  id="custody-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="بيان تفصيلي بالأعمال الطارئة أو مصاريف الموقع المطلوبة..."
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {isPending ? 'جاري الحفظ...' : 'حفظ كمسودة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Cash Modal */}
      {isReturnCashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-bold text-foreground">تسجيل استرجاع فائض نقدي للشركة</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              العهدة: {isReturnCashOpen.code} | الرصيد المتبقي بذمة الموظف: {isReturnCashOpen.remainingBalance} ر.س
            </p>

            <form onSubmit={handleReturnCash} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground">المبلغ المسترجع الفعلي (ر.س)</label>
                <input
                  type="text"
                  value={cashReturnAmount}
                  onChange={(e) => setCashReturnAmount(e.target.value)}
                  placeholder={`الحد الأقصى: ${isReturnCashOpen.remainingBalance}`}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnCashOpen(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {isPending ? 'جاري الحفظ...' : 'تأكيد استلام النقد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Custody Modal */}
      {isCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-bold text-destructive">إلغاء طلب العهدة المعتمد</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              العهدة: {isCancelOpen.code} | المبلغ: {isCancelOpen.amount} ر.س (قبل الصرف)
            </p>

            <form onSubmit={handleCancelCustody} className="mt-4 space-y-4">
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
                  onClick={() => setIsCancelOpen(null)}
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
