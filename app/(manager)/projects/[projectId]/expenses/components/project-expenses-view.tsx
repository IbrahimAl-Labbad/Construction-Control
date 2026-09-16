'use client';

import { useState } from 'react';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User as UserIcon,
  Layers,
  Search,
} from 'lucide-react';

import type {
  ProjectExpensesOverviewDTO,
  ExpenseSummaryDTO,
} from '@/lib/expenses';
import { ExpenseStatusBadge } from './expense-status-badge';
import { approveExpenseAction, rejectExpenseAction } from '../actions';

interface ProjectExpensesViewProps {
  initialOverview: ProjectExpensesOverviewDTO;
  currentUserId: string;
}

export function ProjectExpensesView({
  initialOverview,
  currentUserId,
}: ProjectExpensesViewProps) {
  const [overview, setOverview] = useState<ProjectExpensesOverviewDTO>(initialOverview);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reject modal state
  const [rejectingExpense, setRejectingExpense] = useState<ExpenseSummaryDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Approve dialog state
  const [approvingExpense, setApprovingExpense] = useState<ExpenseSummaryDTO | null>(null);

  // Filtered expenses
  const filteredExpenses = overview.expenses.filter((e) => {
    if (selectedStatus !== 'ALL' && e.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        e.submittedBy.name.toLowerCase().includes(q) ||
        (e.budgetLine?.description.toLowerCase().includes(q) ?? false) ||
        (e.budgetLine?.category.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  async function handleApprove(expenseId: string) {
    setError(null);
    setActionLoadingId(expenseId);
    try {
      const result = await approveExpenseAction(overview.projectId, expenseId);
      if (!result.success) {
        setError(result.message);
        return;
      }

      // Update state locally
      setOverview((prev) => {
        const updatedExpenses = prev.expenses.map((e) =>
          e.id === expenseId ? result.data : e,
        );

        // Recalculate financial breakdown
        const updatedExpense = result.data;
        const line = prev.lines.find((l) => l.budgetLineId === updatedExpense.budgetLineId);
        if (!line) return { ...prev, expenses: updatedExpenses };

        const lineExpenses = updatedExpenses.filter(
          (e) => e.budgetLineId === updatedExpense.budgetLineId,
        );
        const actualSpend = lineExpenses
          .filter((e) => e.status === 'APPROVED')
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const pendingExposure = lineExpenses
          .filter((e) => e.status === 'SUBMITTED')
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const auth = parseFloat(line.authorizedAmount);
        const avail = auth - actualSpend;

        const updatedLines = prev.lines.map((l) =>
          l.budgetLineId === line.budgetLineId
            ? {
                ...l,
                actualSpend: actualSpend.toFixed(2),
                pendingExposure: pendingExposure.toFixed(2),
                availableBalance: avail.toFixed(2),
                projectedBalance: (avail - pendingExposure).toFixed(2),
              }
            : l,
        );

        const totalActual = updatedExpenses
          .filter((e) => e.status === 'APPROVED')
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalPending = updatedExpenses
          .filter((e) => e.status === 'SUBMITTED')
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalAuth = parseFloat(prev.totalAuthorizedBudget);
        const totalAvail = totalAuth - totalActual;

        return {
          ...prev,
          totalActualSpend: totalActual.toFixed(2),
          totalPendingExposure: totalPending.toFixed(2),
          totalAvailableBalance: totalAvail.toFixed(2),
          totalProjectedBalance: (totalAvail - totalPending).toFixed(2),
          lines: updatedLines,
          expenses: updatedExpenses,
        };
      });

      setApprovingExpense(null);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject() {
    if (!rejectingExpense) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setRejectError('سبب الرفض يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }

    setRejectError(null);
    setActionLoadingId(rejectingExpense.id);
    try {
      const result = await rejectExpenseAction(
        overview.projectId,
        rejectingExpense.id,
        { rejectionReason: rejectionReason.trim() },
      );

      if (!result.success) {
        setRejectError(result.message);
        return;
      }

      // Update state locally
      setOverview((prev) => {
        const updatedExpenses = prev.expenses.map((e) =>
          e.id === rejectingExpense.id ? result.data : e,
        );

        // Update pending exposure
        const totalPending = updatedExpenses
          .filter((e) => e.status === 'SUBMITTED')
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalAvail = parseFloat(prev.totalAvailableBalance);

        return {
          ...prev,
          totalPendingExposure: totalPending.toFixed(2),
          totalProjectedBalance: (totalAvail - totalPending).toFixed(2),
          expenses: updatedExpenses,
        };
      });

      setRejectingExpense(null);
      setRejectionReason('');
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Error Alert */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between"
          data-testid="expenses-error-alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline hover:no-underline"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Financial Overview Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Authorized Budget */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              الموازنة التقديرية المعتمدة
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="size-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className="text-2xl font-bold tracking-tight text-foreground font-mono"
              data-testid="total-authorized-budget"
            >
              {overview.totalAuthorizedBudget}
            </span>
            <span className="text-xs text-muted-foreground me-1 font-medium"> ر.س</span>
          </div>
        </div>

        {/* 2. Actual Spend */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              المنصرف الفعلي (معتمد)
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 font-mono"
              data-testid="total-actual-spend"
            >
              {overview.totalActualSpend}
            </span>
            <span className="text-xs text-muted-foreground me-1 font-medium"> ر.س</span>
          </div>
        </div>

        {/* 3. Pending Exposure */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              مطالبات قيد الاعتماد
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Clock className="size-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-400 font-mono"
              data-testid="total-pending-exposure"
            >
              {overview.totalPendingExposure}
            </span>
            <span className="text-xs text-muted-foreground me-1 font-medium"> ر.س</span>
          </div>
        </div>

        {/* 4. Available Balance */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              الرصيد المالي المتاح
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Layers className="size-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className="text-2xl font-bold tracking-tight text-indigo-700 dark:text-indigo-400 font-mono"
              data-testid="total-available-balance"
            >
              {overview.totalAvailableBalance}
            </span>
            <span className="text-xs text-muted-foreground me-1 font-medium"> ر.س</span>
          </div>
        </div>
      </div>

      {/* Budget Lines Allocation Summary */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-5 py-3">
          <h2 className="text-sm font-bold text-foreground">
            متابعة بنود الموازنة والإنفاق الفعلي
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/20 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">بند الموازنة</th>
                <th className="px-4 py-3">التصنيف</th>
                <th className="px-4 py-3">الموازنة المرصودة</th>
                <th className="px-4 py-3">المنصرف الفعلي</th>
                <th className="px-4 py-3">قيد الاعتماد</th>
                <th className="px-4 py-3">الرصيد المتاح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.lines.map((line) => (
                <tr key={line.budgetLineId} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{line.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{line.category}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{line.authorizedAmount} ر.س</td>
                  <td className="px-4 py-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {line.actualSpend} ر.س
                  </td>
                  <td className="px-4 py-3 font-mono text-blue-700 dark:text-blue-400">
                    {line.pendingExposure} ر.س
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                    {line.availableBalance} ر.س
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expenses Table & Management */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED', 'DRAFT'] as const).map((st) => (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={selectedStatus === st}
                onClick={() => setSelectedStatus(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedStatus === st
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                data-testid={`filter-tab-${st.toLowerCase()}`}
              >
                {st === 'ALL'
                  ? 'كافة المطالبات'
                  : st === 'SUBMITTED'
                  ? 'قيد الاعتماد'
                  : st === 'APPROVED'
                  ? 'معتمد'
                  : st === 'REJECTED'
                  ? 'مرفوض'
                  : 'مسودة'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="بحث في المطالبات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background ps-9 pe-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Expenses List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/30 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">تاريخ المصروف</th>
                <th className="px-4 py-3">الوصف والتفاصيل</th>
                <th className="px-4 py-3">بند الموازنة</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">مقدم الطلب</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد مطالبات مصروفات مطابقة للشروط الحالية
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isSubmitter = expense.submittedById === currentUserId;
                  const isActionLoading = actionLoadingId === expense.id;

                  return (
                    <tr
                      key={expense.id}
                      className="hover:bg-muted/10 transition-colors"
                      data-testid={`expense-row-${expense.id}`}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono">
                        {new Date(expense.expenseDate).toLocaleDateString('ar-SA')}
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                        <div>{expense.description}</div>
                        {expense.status === 'REJECTED' && expense.rejectionReason && (
                          <div className="text-destructive text-[11px] mt-0.5">
                            سبب الرفض: {expense.rejectionReason}
                          </div>
                        )}
                      </td>

                      {/* Budget Line */}
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="font-semibold text-foreground">
                          {expense.budgetLine?.category}
                        </div>
                        <div className="text-[11px] truncate max-w-[160px]">
                          {expense.budgetLine?.description}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 font-mono font-bold text-foreground whitespace-nowrap">
                        {expense.amount} ر.س
                      </td>

                      {/* Submitter */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="size-3.5" />
                          <span>{expense.submittedBy.name}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ExpenseStatusBadge status={expense.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {expense.status === 'SUBMITTED' ? (
                          <div className="flex items-center justify-center gap-2">
                            {/* Approve Button */}
                            <button
                              type="button"
                              disabled={isSubmitter || isActionLoading}
                              onClick={() => setApprovingExpense(expense)}
                              title={
                                isSubmitter
                                  ? 'لا يمكنك اعتماد مصروف قمت بتقديمه بنفسك'
                                  : 'اعتماد المصروف'
                              }
                              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors shadow-sm ${
                                isSubmitter
                                  ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                              data-testid={`approve-expense-button-${expense.id}`}
                            >
                              اعتماد
                            </button>

                            {/* Reject Button */}
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => {
                                setRejectingExpense(expense);
                                setRejectionReason('');
                                setRejectError(null);
                              }}
                              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                              data-testid={`reject-expense-button-${expense.id}`}
                            >
                              رفض
                            </button>
                          </div>
                        ) : expense.status === 'APPROVED' ? (
                          <div className="text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                            اعتمد بواسطة {expense.approvedBy?.name}
                          </div>
                        ) : expense.status === 'REJECTED' ? (
                          <div className="text-destructive text-[11px] font-medium">
                            رُفض بواسطة {expense.rejectedBy?.name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">مسودة مؤقتة</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog: Approve Expense */}
      {approvingExpense && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="approve-confirmation-dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">تأكيد اعتماد المصروف</h3>
                <p className="text-xs text-muted-foreground">
                  سيتم تسجيل المبلغ كمنصرف فعلي وخصمه فورياً من موازنة المشروع
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">مبلغ المصروف:</span>
                <span className="font-bold font-mono text-foreground">
                  {approvingExpense.amount} ر.س
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">بند التكلفة:</span>
                <span className="font-medium text-foreground">
                  {approvingExpense.budgetLine?.category} - {approvingExpense.budgetLine?.description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">مقدم الطلب:</span>
                <span className="font-medium text-foreground">
                  {approvingExpense.submittedBy.name}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovingExpense(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                disabled={actionLoadingId === approvingExpense.id}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleApprove(approvingExpense.id)}
                disabled={actionLoadingId === approvingExpense.id}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                data-testid="confirm-approve-button"
              >
                {actionLoadingId === approvingExpense.id ? 'جارٍ الاعتماد...' : 'تأكيد الاعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Expense */}
      {rejectingExpense && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="reject-expense-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <XCircle className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">رفض طلب المصروف</h3>
                <p className="text-xs text-muted-foreground">
                  يجب تدوين سبب واضح للرفض ليتمكن مقدم الطلب من مراجعته
                </p>
              </div>
            </div>

            {rejectError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {rejectError}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="rejection-reason-input"
                className="block text-xs font-bold text-foreground"
              >
                سبب الرفض <span className="text-destructive">*</span>
              </label>
              <textarea
                id="rejection-reason-input"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="أدخل سبب الرفض بالتفصيل (3 أحرف على الأقل)..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="rejection-reason-input"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingExpense(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                disabled={actionLoadingId === rejectingExpense.id}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoadingId === rejectingExpense.id}
                className="rounded-md bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90"
                data-testid="confirm-reject-button"
              >
                {actionLoadingId === rejectingExpense.id ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
