'use client';

/**
 * app/variation-orders/components/variation-order-list.tsx
 *
 * Client component for filtering, searching, and viewing Variation Orders list.
 *
 * Follows AGENTS.md §13, §19, §26.
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Filter, ExternalLink, Layers } from 'lucide-react';
import type { VariationOrderSummaryDTO } from '@/lib/variation-orders';
import { VariationStatusBadge } from './variation-status-badge';

interface VariationOrderListProps {
  variations: VariationOrderSummaryDTO[];
}

export function VariationOrderList({ variations }: VariationOrderListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return variations.filter((vo) => {
      const matchesSearch =
        search.trim() === '' ||
        vo.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        vo.title.toLowerCase().includes(search.toLowerCase()) ||
        vo.projectName.toLowerCase().includes(search.toLowerCase()) ||
        vo.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        vo.createdByName.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || vo.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [variations, search, statusFilter]);

  return (
    <div className="space-y-4" data-testid="variation-order-list">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute inset-inline-start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="بحث برقم الأمر، العنوان، المشروع، أو اسم المهندس..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background ps-9 pe-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="variation-search-input"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="variation-status-filter"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="SUBMITTED">قيد الاعتماد</option>
            <option value="APPROVED">معتمد</option>
            <option value="REJECTED">مرفوض</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Layers className="size-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-foreground">لا توجد أوامر تغيير</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search || statusFilter !== 'ALL'
              ? 'لم يتم العثور على أوامر تغيير تطابق شروط البحث'
              : 'لم يتم تسجيل أي أوامر تغيير حتى الآن'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-sm text-start">
            <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th className="py-3 px-4 text-start">رقم الأمر</th>
                <th className="py-3 px-4 text-start">المشروع</th>
                <th className="py-3 px-4 text-start">العنوان</th>
                <th className="py-3 px-4 text-start">الحالة</th>
                <th className="py-3 px-4 text-start">الأثر المالي</th>
                <th className="py-3 px-4 text-start">بنود التغيير</th>
                <th className="py-3 px-4 text-start">المهندس المقدم</th>
                <th className="py-3 px-4 text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((vo) => {
                const numAmount = parseFloat(vo.impactAmount);
                const isPositive = numAmount > 0;
                const isNegative = numAmount < 0;

                return (
                  <tr
                    key={vo.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`variation-row-${vo.id}`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      {vo.orderNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-foreground">{vo.projectName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{vo.projectCode}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-foreground max-w-xs truncate" title={vo.title}>
                        {vo.title}
                      </div>
                      {vo.commitmentVendorName && (
                        <div className="text-xs text-muted-foreground">
                          المقاول: {vo.commitmentVendorName}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <VariationStatusBadge status={vo.status} />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold">
                      <span
                        className={
                          isPositive
                            ? 'text-rose-600 dark:text-rose-400'
                            : isNegative
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {isPositive ? `+${vo.impactAmount}` : vo.impactAmount} ر.س
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {vo.linesCount > 0 ? `${vo.linesCount} بند` : 'مبلغ مقطوع'}
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {vo.createdByName}
                    </td>
                    <td className="py-3.5 px-4 text-end">
                      <Link
                        href={`/variation-orders/${vo.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        data-testid={`view-variation-button-${vo.id}`}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        <span>تفاصيل</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
