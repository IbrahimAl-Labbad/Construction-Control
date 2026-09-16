'use client';

import { useState } from 'react';
import {
  Plus,
  Receipt,
  AlertTriangle,
  Pencil,
  Trash2,
  Search,
} from 'lucide-react';

import type { ExpenseSummaryDTO, ActiveProjectForExpenseDTO } from '@/lib/expenses';
import { ExpenseStatusBadge } from '@/app/(manager)/projects/[projectId]/expenses/components/expense-status-badge';
import {
  createExpenseDraftAction,
  updateExpenseDraftAction,
  deleteExpenseDraftAction,
  submitExpenseAction,
  reopenExpenseDraftAction,
} from '../actions';

interface UserExpensesViewProps {
  initialExpenses: ExpenseSummaryDTO[];
  activeProjects: ActiveProjectForExpenseDTO[];
}

export function UserExpensesView({
  initialExpenses,
  activeProjects,
}: UserExpensesViewProps) {
  const [expenses, setExpenses] = useState<ExpenseSummaryDTO[]>(initialExpenses);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Form modal state (for Create & Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseSummaryDTO | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjects[0]?.id ?? '',
  );
  const [selectedBudgetLineId, setSelectedBudgetLineId] = useState<string>(
    activeProjects[0]?.lines[0]?.id ?? '',
  );
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState<string>(
    () => new Date().toISOString().split('T')[0] ?? '',
  );
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Filtered project lines based on selected project
  const currentProject = activeProjects.find((p) => p.id === selectedProjectId);
  const availableLines = currentProject?.lines ?? [];

  function openCreateModal() {
    setEditingExpense(null);
    const defaultProj = activeProjects[0];
    setSelectedProjectId(defaultProj?.id ?? '');
    setSelectedBudgetLineId(defaultProj?.lines[0]?.id ?? '');
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0] ?? '');
    setDescription('');
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(expense: ExpenseSummaryDTO) {
    setEditingExpense(expense);
    setSelectedProjectId(expense.projectId);
    setSelectedBudgetLineId(expense.budgetLineId);
    setAmount(expense.amount);
    setExpenseDate(new Date(expense.expenseDate).toISOString().split('T')[0] ?? '');
    setDescription(expense.description);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSaveDraft() {
    setFormError(null);
    if (!selectedProjectId) {
      setFormError('يرجى اختيار المشروع');
      return;
    }
    if (!selectedBudgetLineId) {
      setFormError('يرجى اختيار بند الموازنة');
      return;
    }
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setFormError('المبلغ يجب أن يكون رقماً موجباً أكبر من صفر');
      return;
    }
    if (!description.trim() || description.trim().length < 3) {
      setFormError('وصف المصروف يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }

    const payload = {
      projectId: selectedProjectId,
      budgetLineId: selectedBudgetLineId,
      amount: amount.trim(),
      expenseDate: new Date(expenseDate),
      description: description.trim(),
    };

    setActionLoadingId('form-save');
    try {
      if (editingExpense) {
        const result = await updateExpenseDraftAction(editingExpense.id, payload);
        if (!result.success) {
          setFormError(result.message);
          return;
        }
        setExpenses((prev) =>
          prev.map((e) => (e.id === editingExpense.id ? result.data : e)),
        );
      } else {
        const result = await createExpenseDraftAction(payload);
        if (!result.success) {
          setFormError(result.message);
          return;
        }
        setExpenses((prev) => [result.data, ...prev]);
      }
      setIsModalOpen(false);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSubmit(expenseId: string) {
    setGeneralError(null);
    setActionLoadingId(expenseId);
    try {
      const result = await submitExpenseAction(expenseId);
      if (!result.success) {
        setGeneralError(result.message);
        return;
      }
      setExpenses((prev) =>
        prev.map((e) => (e.id === expenseId ? result.data : e)),
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(expenseId: string) {
    setGeneralError(null);
    setActionLoadingId(expenseId);
    try {
      const result = await deleteExpenseDraftAction(expenseId);
      if (!result.success) {
        setGeneralError(result.message ?? 'فشل حذف المصروف');
        return;
      }
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReopen(expenseId: string) {
    setGeneralError(null);
    setActionLoadingId(expenseId);
    try {
      const result = await reopenExpenseDraftAction(expenseId);
      if (!result.success) {
        setGeneralError(result.message);
        return;
      }
      setExpenses((prev) =>
        prev.map((e) => (e.id === expenseId ? result.data : e)),
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  // Filtered expenses
  const filteredExpenses = expenses.filter((e) => {
    if (selectedStatus !== 'ALL' && e.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.project?.name.toLowerCase().includes(q) ?? false) ||
        (e.project?.code.toLowerCase().includes(q) ?? false) ||
        (e.budgetLine?.category.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Error Alert */}
      {generalError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between"
          data-testid="user-expenses-error-alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span>{generalError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGeneralError(null)}
            className="text-xs underline hover:no-underline"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Header & Create Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            مطالبات ومصروفات الموقع
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            تسجيل النفقات الميدانية ومتابعة مسار التدقيق والاعتماد المالي
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          disabled={activeProjects.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          data-testid="open-create-expense-button"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>تسجيل مصروف جديد</span>
        </button>
      </div>

      {activeProjects.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-400">
          تنبيه: لا توجد مشاريع نشطة تمتلك موازنة معتمدة حالياً لتسجيل المصروفات عليها.
        </div>
      )}

      {/* Expenses Table & Management */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {(['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((st) => (
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
                data-testid={`claimant-filter-${st.toLowerCase()}`}
              >
                {st === 'ALL'
                  ? 'كافة المطالبات'
                  : st === 'DRAFT'
                  ? 'المسودات'
                  : st === 'SUBMITTED'
                  ? 'قيد الاعتماد'
                  : st === 'APPROVED'
                  ? 'المعتمدة'
                  : 'المرفوضة'}
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
                <th className="px-4 py-3">المشروع</th>
                <th className="px-4 py-3">بند الموازنة</th>
                <th className="px-4 py-3">الوصف</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد مطالبات مصروفات مسجلة حالياً
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isLoading = actionLoadingId === expense.id;

                  return (
                    <tr
                      key={expense.id}
                      className="hover:bg-muted/10 transition-colors"
                      data-testid={`claimant-expense-row-${expense.id}`}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono">
                        {new Date(expense.expenseDate).toLocaleDateString('ar-SA')}
                      </td>

                      {/* Project */}
                      <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                        <div>{expense.project?.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {expense.project?.code}
                        </div>
                      </td>

                      {/* Budget Line */}
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="font-semibold text-foreground">
                          {expense.budgetLine?.category}
                        </div>
                        <div className="text-[11px] truncate max-w-[150px]">
                          {expense.budgetLine?.description}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                        <div>{expense.description}</div>
                        {expense.status === 'REJECTED' && expense.rejectionReason && (
                          <div
                            className="text-destructive text-[11px] mt-0.5"
                            data-testid={`rejection-reason-text-${expense.id}`}
                          >
                            سبب الرفض: {expense.rejectionReason}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 font-mono font-bold text-foreground whitespace-nowrap">
                        {expense.amount} ر.س
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ExpenseStatusBadge status={expense.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {expense.status === 'DRAFT' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Submit Button */}
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleSubmit(expense.id)}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                              data-testid={`submit-expense-button-${expense.id}`}
                            >
                              تقديم
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => openEditModal(expense)}
                              className="rounded-md border border-input bg-background p-1 text-muted-foreground hover:text-foreground"
                              title="تعديل المسودة"
                              data-testid={`edit-expense-button-${expense.id}`}
                            >
                              <Pencil className="size-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleDelete(expense.id)}
                              className="rounded-md border border-destructive/30 bg-destructive/10 p-1 text-destructive hover:bg-destructive/20"
                              title="حذف المسودة"
                              data-testid={`delete-expense-button-${expense.id}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ) : expense.status === 'REJECTED' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Reopen Button */}
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleReopen(expense.id)}
                              className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                              data-testid={`reopen-expense-button-${expense.id}`}
                            >
                              إعادة فتح كمسودة
                            </button>
                          </div>
                        ) : expense.status === 'SUBMITTED' ? (
                          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                            بانتظار موافقة المدير
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                            معتمد رسمياً
                          </span>
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

      {/* Modal: Create / Edit Expense Draft */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="expense-form-modal"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingExpense ? 'تعديل مسودة المصروف' : 'تسجيل مطالبة مصروف جديد'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  أدخل تفاصيل النفقة الميدانية وبند الموازنة المطابق لها
                </p>
              </div>
            </div>

            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Project Select */}
              <div>
                <label className="block font-bold text-foreground mb-1">المشروع</label>
                <select
                  disabled={editingExpense !== null} // Project is immutable after creation
                  value={selectedProjectId}
                  onChange={(e) => {
                    const newProjId = e.target.value;
                    setSelectedProjectId(newProjId);
                    const proj = activeProjects.find((p) => p.id === newProjId);
                    setSelectedBudgetLineId(proj?.lines[0]?.id ?? '');
                  }}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  data-testid="expense-project-select"
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget Line Select */}
              <div>
                <label className="block font-bold text-foreground mb-1">بند الموازنة</label>
                <select
                  value={selectedBudgetLineId}
                  onChange={(e) => setSelectedBudgetLineId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="expense-budget-line-select"
                >
                  {availableLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.category} - {l.description} (المرصود: {l.amount} ر.س)
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">المبلغ (ر.س)</label>
                  <input
                    type="text"
                    placeholder="مثال: 1500.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    data-testid="expense-amount-input"
                  />
                </div>
                <div>
                  <label className="block font-bold text-foreground mb-1">تاريخ المصروف</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="expense-date-input"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-foreground mb-1">
                  الوصف وتفاصيل الصرف
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="بيان تفاصيل المشتريات / أعمال الصرف الميداني..."
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="expense-description-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                disabled={actionLoadingId === 'form-save'}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={actionLoadingId === 'form-save'}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                data-testid="save-expense-draft-button"
              >
                {actionLoadingId === 'form-save' ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
