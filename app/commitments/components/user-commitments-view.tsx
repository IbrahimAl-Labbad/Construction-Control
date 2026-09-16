'use client';

import { useState } from 'react';
import {
  Plus,
  FileSignature,
  AlertTriangle,
  Pencil,
  Trash2,
  Search,
  Building2,
  Calendar,
  Send,
  RotateCcw,
} from 'lucide-react';

import type {
  CommitmentSummaryDTO,
  ActiveProjectForCommitmentDTO,
} from '@/lib/commitments';
import { CommitmentStatusBadge } from './commitment-status-badge';
import {
  createCommitmentDraftAction,
  updateCommitmentDraftAction,
  deleteCommitmentDraftAction,
  submitCommitmentAction,
  reopenCommitmentDraftAction,
} from '../actions';

interface UserCommitmentsViewProps {
  initialCommitments: CommitmentSummaryDTO[];
  activeProjects: ActiveProjectForCommitmentDTO[];
  canCreate: boolean;
}

export function UserCommitmentsView({
  initialCommitments,
  activeProjects,
  canCreate,
}: UserCommitmentsViewProps) {
  const [commitments, setCommitments] = useState<CommitmentSummaryDTO[]>(initialCommitments);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<CommitmentSummaryDTO | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjects[0]?.id ?? '',
  );
  const [selectedBudgetLineId, setSelectedBudgetLineId] = useState<string>(
    activeProjects[0]?.lines[0]?.id ?? '',
  );
  const [vendorName, setVendorName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [commitmentDate, setCommitmentDate] = useState<string>(
    () => new Date().toISOString().split('T')[0] ?? '',
  );
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const currentProject = activeProjects.find((p) => p.id === selectedProjectId);
  const availableLines = currentProject?.lines ?? [];

  function openCreateModal() {
    setEditingCommitment(null);
    const defaultProj = activeProjects[0];
    setSelectedProjectId(defaultProj?.id ?? '');
    setSelectedBudgetLineId(defaultProj?.lines[0]?.id ?? '');
    setVendorName('');
    setReferenceNumber('');
    setAmount('');
    setCommitmentDate(new Date().toISOString().split('T')[0] ?? '');
    setDescription('');
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(c: CommitmentSummaryDTO) {
    setEditingCommitment(c);
    setSelectedProjectId(c.projectId);
    setSelectedBudgetLineId(c.budgetLineId);
    setVendorName(c.vendorName);
    setReferenceNumber(c.referenceNumber ?? '');
    setAmount(c.amount);
    setCommitmentDate(new Date(c.commitmentDate).toISOString().split('T')[0] ?? '');
    setDescription(c.description);
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
    if (!vendorName.trim() || vendorName.trim().length < 2) {
      setFormError('اسم المورد أو المقاول يجب أن يتكون من حرفين على الأقل');
      return;
    }
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setFormError('المبلغ يجب أن يكون رقماً موجباً أكبر من صفر');
      return;
    }
    if (!description.trim() || description.trim().length < 3) {
      setFormError('وصف الالتزام يجب أن يتكون من 3 أحرف على الأقل');
      return;
    }

    const payload = {
      projectId: selectedProjectId,
      budgetLineId: selectedBudgetLineId,
      vendorName: vendorName.trim(),
      referenceNumber: referenceNumber.trim() || null,
      amount: amount.trim(),
      commitmentDate: new Date(commitmentDate),
      description: description.trim(),
    };

    setActionLoadingId('form-save');
    try {
      if (editingCommitment) {
        const result = await updateCommitmentDraftAction(editingCommitment.id, payload);
        if (!result.success) {
          setFormError(result.message);
          return;
        }
        setCommitments((prev) =>
          prev.map((c) => (c.id === editingCommitment.id ? result.data : c)),
        );
      } else {
        const result = await createCommitmentDraftAction(payload);
        if (!result.success) {
          setFormError(result.message);
          return;
        }
        setCommitments((prev) => [result.data, ...prev]);
      }
      setIsModalOpen(false);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSubmit(commitmentId: string) {
    setGeneralError(null);
    setActionLoadingId(commitmentId);
    try {
      const result = await submitCommitmentAction(commitmentId);
      if (!result.success) {
        setGeneralError(result.message);
        return;
      }
      setCommitments((prev) =>
        prev.map((c) => (c.id === commitmentId ? result.data : c)),
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(commitmentId: string) {
    setGeneralError(null);
    setActionLoadingId(commitmentId);
    try {
      const result = await deleteCommitmentDraftAction(commitmentId);
      if (!result.success) {
        setGeneralError(result.message ?? 'فشل حذف الالتزام');
        return;
      }
      setCommitments((prev) => prev.filter((c) => c.id !== commitmentId));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReopen(commitmentId: string) {
    setGeneralError(null);
    setActionLoadingId(commitmentId);
    try {
      const result = await reopenCommitmentDraftAction(commitmentId);
      if (!result.success) {
        setGeneralError(result.message);
        return;
      }
      setCommitments((prev) =>
        prev.map((c) => (c.id === commitmentId ? result.data : c)),
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  // Filtered commitments
  const filteredCommitments = commitments.filter((c) => {
    if (selectedStatus !== 'ALL' && c.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.vendorName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.referenceNumber?.toLowerCase().includes(q) ?? false) ||
        (c.project?.name.toLowerCase().includes(q) ?? false) ||
        (c.project?.code.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSignature className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">الارتباطات المالية وأوامر الشراء</h1>
            <p className="text-sm text-muted-foreground">
              حجز الالتزامات التعاقدية وأوامر التوريد مقابل بنود الموازنة المعتمدة
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            data-testid="create-commitment-button"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>إنشاء مسودة ارتباط شراء</span>
          </button>
        )}
      </div>

      {generalError && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالمورد، البيان، رقم المرجع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background ps-9 pe-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="commitments-search-input"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist">
          {[
            { id: 'ALL', label: 'الكل' },
            { id: 'DRAFT', label: 'المسودات' },
            { id: 'SUBMITTED', label: 'قيد الاعتماد' },
            { id: 'APPROVED', label: 'المعتمدة' },
            { id: 'REJECTED', label: 'المرفوضة' },
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
              data-testid={`filter-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Commitments List */}
      {filteredCommitments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <FileSignature className="size-12 text-muted-foreground/50 mb-3" />
          <p className="text-base font-semibold text-foreground">لا توجد ارتباطات مسجلة</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || selectedStatus !== 'ALL'
              ? 'لا توجد نتائج تطابق معايير التصفية والبحث'
              : 'يمكنك البدء بإنشاء مسودة التزام أو أمر شراء جديد لربطه بالمشروع'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCommitments.map((c) => (
            <div
              key={c.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              data-testid={`commitment-card-${c.id}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <CommitmentStatusBadge status={c.status} />
                  <span className="text-xs font-mono text-muted-foreground">
                    {c.referenceNumber ? `#${c.referenceNumber}` : 'بدون رقم مرجعي'}
                  </span>
                </div>

                <div className="mb-2">
                  <h3 className="font-bold text-foreground text-base line-clamp-1">{c.vendorName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                </div>

                <div className="space-y-1.5 py-3 my-2 border-y border-border text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{c.project?.name ?? 'مشروع'}</span>
                    <span className="font-mono text-muted-foreground/80">({c.project?.code})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block size-1.5 rounded-full bg-primary/60 shrink-0" />
                    <span className="line-clamp-1">بند: {c.budgetLine?.description}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 shrink-0" />
                    <span>{new Date(c.commitmentDate).toLocaleDateString('ar-SA')}</span>
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
                  <span className="text-xs text-muted-foreground">مبلغ الالتزام:</span>
                  <span className="text-lg font-bold font-mono text-foreground">
                    {c.amount} <span className="text-xs font-normal">ر.س</span>
                  </span>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                  {c.status === 'DRAFT' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSubmit(c.id)}
                        disabled={actionLoadingId === c.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        data-testid={`submit-commitment-button-${c.id}`}
                      >
                        <Send className="size-3" />
                        <span>رفع للاعتماد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        disabled={actionLoadingId === c.id}
                        className="p-1.5 rounded-md border border-input hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="تعديل المسودة"
                        data-testid={`edit-commitment-button-${c.id}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={actionLoadingId === c.id}
                        className="p-1.5 rounded-md border border-destructive/30 hover:bg-destructive/10 text-destructive"
                        title="حذف المسودة"
                        data-testid={`delete-commitment-button-${c.id}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}

                  {c.status === 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => handleReopen(c.id)}
                      disabled={actionLoadingId === c.id}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                      data-testid={`reopen-commitment-button-${c.id}`}
                    >
                      <RotateCcw className="size-3.5" />
                      <span>إعادة فتح المسودة للتعديل</span>
                    </button>
                  )}

                  {c.status === 'SUBMITTED' && (
                    <div className="w-full text-center py-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                      بانتظار مراجعة واعتماد المدير
                    </div>
                  )}

                  {c.status === 'APPROVED' && (
                    <div className="w-full text-center py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      معتمد ومحجوز من الموازنة
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="commitment-modal"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-foreground mb-4">
              {editingCommitment ? 'تعديل مسودة الالتزام' : 'إنشاء مسودة التزام مالي جديد'}
            </h2>

            {formError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  المشروع <span className="text-destructive">*</span>
                </label>
                <select
                  disabled={Boolean(editingCommitment)}
                  value={selectedProjectId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setSelectedProjectId(pid);
                    const proj = activeProjects.find((p) => p.id === pid);
                    setSelectedBudgetLineId(proj?.lines[0]?.id ?? '');
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary disabled:opacity-60"
                  data-testid="commitment-project-select"
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  بند الموازنة المستهدف <span className="text-destructive">*</span>
                </label>
                <select
                  value={selectedBudgetLineId}
                  onChange={(e) => setSelectedBudgetLineId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary"
                  data-testid="commitment-budget-line-select"
                >
                  {availableLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description} (السقف: {l.amount} ر.س)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  اسم المورد أو المقاول <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: شركة اليمامة للتوريدات الإنشائية"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary"
                  data-testid="commitment-vendor-name-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    الرقم المرجعي (اختياري)
                  </label>
                  <input
                    type="text"
                    placeholder="PO-2026-001"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:ring-2 focus:ring-primary"
                    data-testid="commitment-reference-number-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    المبلغ (ر.س) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:ring-2 focus:ring-primary"
                    data-testid="commitment-amount-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  تاريخ الالتزام / التعاقد <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={commitmentDate}
                  onChange={(e) => setCommitmentDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary"
                  data-testid="commitment-date-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  بيان وتفاصيل الالتزام <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="وصف المواد أو الأعمال والخدمات المرتبطة بأمر الشراء..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary"
                  data-testid="commitment-description-input"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                data-testid="commitment-cancel-button"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={actionLoadingId === 'form-save'}
                className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                data-testid="commitment-save-draft-button"
              >
                {actionLoadingId === 'form-save' ? 'جاري الحفظ...' : 'حفظ المسودة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
