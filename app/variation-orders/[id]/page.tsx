import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  Layers,
  FolderKanban,
  FileSignature,
  FileSpreadsheet,
  Calendar,
  User,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Role } from '@prisma/client';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { getVariationOrder } from '@/lib/variation-orders';
import { VariationStatusBadge } from '../components/variation-status-badge';
import { VariationDetailActions } from '../components/variation-detail-actions';

interface VariationDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: VariationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const vo = await getVariationOrder(id);
    return {
      title: `${vo.orderNumber} - ${vo.title}`,
      description: `تفاصيل أمر التغيير ${vo.orderNumber} لمشروع ${vo.projectName}`,
    };
  } catch {
    return {
      title: 'أمر التغيير',
    };
  }
}

export default async function VariationDetailPage({ params }: VariationDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  if (!policies.canViewVariationOrders(user)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Layers className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground mb-2">غير مصرح بالوصول</h1>
            <p className="text-sm text-muted-foreground">
              لا تملك صلاحية استعراض تفاصيل أمر التغيير.
            </p>
          </div>
        </main>
      </div>
    );
  }

  let variation;
  try {
    variation = await getVariationOrder(id);
  } catch {
    notFound();
  }

  const isManager = user.role === Role.MANAGER;
  const isCreator = variation.createdById === user.id;

  const numImpact = parseFloat(variation.impactAmount);
  const isPositive = numImpact > 0;
  const isNegative = numImpact < 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Breadcrumb */}
        <nav
          aria-label="مسار التنقل"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/variation-orders" className="hover:text-foreground transition-colors">
            أوامر التغيير
          </Link>
          <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
          <span className="font-mono text-foreground font-semibold">{variation.orderNumber}</span>
        </nav>

        {/* Header & Actions */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-bold text-primary">
                {variation.orderNumber}
              </span>
              <VariationStatusBadge status={variation.status} />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FolderKanban className="size-3.5 text-primary" aria-hidden="true" />
                <span className="font-medium text-foreground">{variation.projectName}</span>
                <span className="font-mono text-[11px]">({variation.projectCode})</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="variation-title">
              {variation.title}
            </h1>
          </div>

          {/* Action buttons */}
          <VariationDetailActions
            variation={variation}
            currentUserId={user.id}
            isManager={isManager}
            isCreator={isCreator}
          />
        </div>

        {/* Status Callout Banners */}
        {variation.status === 'REJECTED' && variation.rejectionReason && (
          <div
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
            data-testid="rejection-reason-callout"
          >
            <XCircle className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">تم رفض أمر التغيير بواسطة {variation.rejectedByName ?? 'المدير'}</p>
              <p className="text-xs">{variation.rejectionReason}</p>
              {variation.rejectedAt && (
                <p className="text-[11px] opacity-75 font-mono">
                  تاريخ الرفض: {new Date(variation.rejectedAt).toLocaleString('ar-SA')}
                </p>
              )}
            </div>
          </div>
        )}

        {variation.status === 'APPROVED' && (
          <div
            className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300"
            role="status"
            data-testid="approval-callout"
          >
            <CheckCircle className="size-5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                أمر تغيير معتمد رسمياً بواسطة {variation.approvedByName ?? 'المدير'}
              </p>
              <p className="text-xs">
                تم دمج هذا الأثر المالي ({variation.impactAmount} ر.س) رسمياً في موازنة المشروع المعتمدة.
              </p>
              {variation.approvedAt && (
                <p className="text-[11px] opacity-75 font-mono">
                  تاريخ الاعتماد: {new Date(variation.approvedAt).toLocaleString('ar-SA')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Financial and Metadata Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Financial Impact */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-1">
            <span className="text-xs font-medium text-muted-foreground">الأثر المالي الصافي</span>
            <div className="text-xl font-bold font-mono">
              <span
                className={
                  isPositive
                    ? 'text-rose-600 dark:text-rose-400'
                    : isNegative
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                }
              >
                {isPositive ? `+${variation.impactAmount}` : variation.impactAmount} ر.س
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isPositive
                ? 'زيادة في الالتزام المالي والتكلفة'
                : isNegative
                ? 'تخفيض ووفر في التكلفة'
                : 'أثر مالي متعادل'}
            </p>
          </div>

          {/* Creation Metadata */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-1">
            <span className="text-xs font-medium text-muted-foreground">مقدم الطلب</span>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <User className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{variation.createdByName}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
              <Calendar className="size-3" aria-hidden="true" />
              <span>{new Date(variation.createdAt).toLocaleDateString('ar-SA')}</span>
            </div>
          </div>

          {/* Budget Line Link */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-1">
            <span className="text-xs font-medium text-muted-foreground">بند الموازنة المرتبط</span>
            {variation.budgetLineDescription ? (
              <div>
                <p className="text-sm font-semibold text-foreground truncate" title={variation.budgetLineDescription}>
                  {variation.budgetLineCategory} - {variation.budgetLineDescription}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  بند مخصص ضمن موازنة المشروع
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">عام على مستوى المشروع</p>
            )}
          </div>

          {/* Commitment Link */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-1">
            <span className="text-xs font-medium text-muted-foreground">الارتباط / عقد مقاول الباطن</span>
            {variation.commitmentReference ? (
              <div>
                <p className="text-sm font-semibold text-foreground truncate" title={variation.commitmentVendorName ?? ''}>
                  {variation.commitmentReference} {variation.commitmentVendorName ? `(${variation.commitmentVendorName})` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  عقد مقاول باطن معتمد
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">غير مرتبط بعقد مقاول محدد</p>
            )}
          </div>
        </div>

        {/* Scope and Technical Justification */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
              <span>بيان الأعمال المطلوب تغييرها</span>
            </h2>
            <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">
              {variation.description}
            </p>
            {variation.scopeImpact && (
              <div className="pt-2 border-t border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground block mb-0.5">
                  أثر نطاق العمل والجدول الزمني:
                </span>
                <p className="text-xs text-foreground/90">{variation.scopeImpact}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
              <FileSignature className="size-4 text-primary" aria-hidden="true" />
              <span>المبرر الفني والميداني</span>
            </h2>
            <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">
              {variation.reason}
            </p>
          </div>
        </div>

        {/* Detailed Line Items (BOQ) */}
        {variation.lines.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Layers className="size-4 text-primary" aria-hidden="true" />
              <span>جدول كميات وتفاصيل بنود التغيير ({variation.lines.length} بند)</span>
            </h2>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs text-start">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="py-2.5 px-3 text-start w-10">#</th>
                    <th className="py-2.5 px-3 text-start min-w-[200px]">بيان الأعمال / البند</th>
                    <th className="py-2.5 px-3 text-start w-16">الوحدة</th>
                    <th className="py-2.5 px-3 text-start w-24">الكمية الأصلية</th>
                    <th className="py-2.5 px-3 text-start w-24">الكمية المعدلة</th>
                    <th className="py-2.5 px-3 text-start w-24">فارق الكمية</th>
                    <th className="py-2.5 px-3 text-start w-24">السعر الأصلي</th>
                    <th className="py-2.5 px-3 text-start w-24">السعر المعدل</th>
                    <th className="py-2.5 px-3 text-start w-28">الأثر المالي للبند</th>
                    <th className="py-2.5 px-3 text-start min-w-[150px]">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {variation.lines.map((line, idx) => {
                    const delta = parseFloat(line.financialDelta);
                    const qtyDelta = parseFloat(line.quantityDelta);

                    return (
                      <tr key={line.id} className="hover:bg-muted/20" data-testid={`vo-line-row-${line.id}`}>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{line.description}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{line.unit}</td>
                        <td className="py-2.5 px-3 font-mono">{line.originalQuantity}</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">{line.revisedQuantity}</td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className={qtyDelta > 0 ? 'text-rose-600' : qtyDelta < 0 ? 'text-emerald-600' : ''}>
                            {qtyDelta > 0 ? `+${line.quantityDelta}` : line.quantityDelta}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{line.originalRate} ر.س</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">{line.revisedRate} ر.س</td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span
                            className={
                              delta > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : delta < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }
                          >
                            {delta > 0 ? `+${line.financialDelta}` : line.financialDelta} ر.س
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground text-[11px]">{line.notes ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
