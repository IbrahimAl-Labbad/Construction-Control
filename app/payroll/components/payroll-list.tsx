'use client';

/**
 * app/payroll/components/payroll-list.tsx
 *
 * Client Component — Filterable RTL table of PayrollEntry records.
 * Supports filters:
 * - Worker name text search
 * - Status filter
 * - Project filter
 * - Period year & month filters
 */

import { useState } from 'react';
import Link from 'next/link';
import { Search, Eye, Filter, RotateCcw, Users } from 'lucide-react';

import type { PayrollDetailDTO, PayrollStatus } from '@/lib/payroll/types';
import { PayrollStatusBadge } from './payroll-status-badge';

interface PayrollListProps {
  entries: PayrollDetailDTO[];
  isManager: boolean;
  isAccountant: boolean;
  currentUserId: string;
}

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

export function PayrollList({
  entries,
  isManager: _isManager,
  isAccountant: _isAccountant,
  currentUserId: _currentUserId,
}: PayrollListProps) {
  // Filters state
  const [workerSearch, setWorkerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');

  // Extract distinct projects, years, months for filters
  const distinctProjects = Array.from(
    new Map(
      entries.flatMap((e) =>
        e.project
          ? [[e.projectId, { id: e.projectId, name: e.project.name, code: e.project.code }]]
          : [],
      ),
    ).values(),
  );

  const distinctYears = Array.from(new Set(entries.map((e) => e.periodYear))).sort(
    (a, b) => b - a,
  );

  // Apply filters
  const filteredEntries = entries.filter((entry) => {
    // Worker name search
    if (workerSearch.trim()) {
      const term = workerSearch.trim().toLowerCase();
      const matchName = entry.workerName.toLowerCase().includes(term);
      const matchRef = entry.workerReference?.toLowerCase().includes(term);
      const matchTrade = entry.tradeOrTitle?.toLowerCase().includes(term);
      if (!matchName && !matchRef && !matchTrade) return false;
    }

    // Status filter
    if (statusFilter !== 'ALL' && entry.status !== statusFilter) {
      return false;
    }

    // Project filter
    if (projectFilter !== 'ALL' && entry.projectId !== projectFilter) {
      return false;
    }

    // Year filter
    if (yearFilter !== 'ALL' && entry.periodYear !== parseInt(yearFilter, 10)) {
      return false;
    }

    // Month filter
    if (monthFilter !== 'ALL' && entry.periodMonth !== parseInt(monthFilter, 10)) {
      return false;
    }

    return true;
  });

  function handleResetFilters() {
    setWorkerSearch('');
    setStatusFilter('ALL');
    setProjectFilter('ALL');
    setYearFilter('ALL');
    setMonthFilter('ALL');
  }

  const hasActiveFilters =
    workerSearch.trim() !== '' ||
    statusFilter !== 'ALL' ||
    projectFilter !== 'ALL' ||
    yearFilter !== 'ALL' ||
    monthFilter !== 'ALL';

  return (
    <div className="space-y-4" data-testid="payroll-list-component">
      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Filter className="size-4 text-primary" aria-hidden="true" />
          <span>تصفية وبحث القيود</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="ms-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              <span>إعادة تعيين الفلاتر</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Worker Search */}
          <div className="relative">
            <Search
              className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={workerSearch}
              onChange={(e) => setWorkerSearch(e.target.value)}
              placeholder="بحث باسم العامل أو المهنة..."
              className="w-full rounded-lg border border-input bg-background ps-9 pe-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-search-input"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-status-filter"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="DRAFT">مسودة</option>
              <option value="SUBMITTED">قيد الاعتماد</option>
              <option value="APPROVED">معتمد</option>
              <option value="REJECTED">مرفوض</option>
              <option value="CANCELLED">ملغى</option>
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-project-filter"
            >
              <option value="ALL">جميع المشاريع</option>
              {distinctProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-year-filter"
            >
              <option value="ALL">جميع السنوات</option>
              {distinctYears.map((y) => (
                <option key={y} value={y.toString()}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="payroll-month-filter"
            >
              <option value="ALL">جميع الشهور</option>
              <option value="1">يناير (01)</option>
              <option value="2">فبراير (02)</option>
              <option value="3">مارس (03)</option>
              <option value="4">أبريل (04)</option>
              <option value="5">مايو (05)</option>
              <option value="6">يونيو (06)</option>
              <option value="7">يوليو (07)</option>
              <option value="8">أغسطس (08)</option>
              <option value="9">سبتمبر (09)</option>
              <option value="10">أكتوبر (10)</option>
              <option value="11">نوفمبر (11)</option>
              <option value="12">ديسمبر (12)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <Users className="size-12 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-base font-bold text-foreground mb-1">لا توجد قيود أجور مطابقة</h3>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? 'جرّب تعديل خيارات البحث أو التصفية أعلاه لعرض النتائج.'
              : 'لم يتم تسجيل أي قيود أجور عمالة حتى الآن.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start" data-testid="payroll-table">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3.5 text-start">المشروع</th>
                  <th scope="col" className="px-4 py-3.5 text-start">العامل الميداني</th>
                  <th scope="col" className="px-4 py-3.5 text-start">الفترة</th>
                  <th scope="col" className="px-4 py-3.5 text-start">المبلغ</th>
                  <th scope="col" className="px-4 py-3.5 text-start">الحالة</th>
                  <th scope="col" className="px-4 py-3.5 text-start">تاريخ القيد</th>
                  <th scope="col" className="px-4 py-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`payroll-row-${entry.id}`}
                  >
                    {/* Project */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">
                        {entry.project?.name ?? '—'}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {entry.project?.code ?? '—'}
                      </div>
                    </td>

                    {/* Worker */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">
                        {entry.workerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.tradeOrTitle ?? entry.workerReference ?? '—'}
                      </div>
                    </td>

                    {/* Period */}
                    <td className="px-4 py-3.5 text-foreground font-medium whitespace-nowrap">
                      {entry.periodFormattedAr}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3.5 font-mono font-bold text-foreground whitespace-nowrap">
                      {formatMoney(entry.amount)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {entry.currency}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <PayrollStatusBadge status={entry.status as PayrollStatus} />
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <Link
                        href={`/payroll/${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
                        data-testid={`view-payroll-${entry.id}`}
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        <span>عرض التفاصيل</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-3 bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>إجمالي القيود المعروضة: {filteredEntries.length} قيد</span>
          </div>
        </div>
      )}
    </div>
  );
}
