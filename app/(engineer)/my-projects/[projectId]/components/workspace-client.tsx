'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Flag,
  Plus,
  Receipt,
  Tag,
  Wallet,
} from 'lucide-react';
import type { EngineerWorkspaceDetailDTO } from '@/lib/engineer-workspace';
import { MilestoneStatusBadge } from '@/app/(manager)/projects/[projectId]/milestones/components/milestone-status-badge';
import { ProgressReportStatusBadge } from '@/components/progress-reports';
import { ExpenseStatusBadge } from '@/app/(manager)/projects/[projectId]/expenses/components/expense-status-badge';
import { CustodyStatusBadge } from '@/app/custodies/components/custody-status-badge';

interface WorkspaceClientProps {
  workspace: EngineerWorkspaceDetailDTO;
}

type TabKey = 'milestones' | 'reports' | 'expenses' | 'custodies' | 'categories';

export function WorkspaceClient({ workspace }: WorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('milestones');

  const { project, milestones, recentReports, recentExpenses, recentCustodies, availableBudgetCategories } =
    workspace;

  const tabs: Array<{ key: TabKey; label: string; count: number; icon: typeof Flag }> = [
    { key: 'milestones', label: 'محطات المشروع', count: milestones.length, icon: Flag },
    { key: 'reports', label: 'تقاريري الميدانية', count: recentReports.length, icon: FileText },
    { key: 'expenses', label: 'مصاريفي الميدانية', count: recentExpenses.length, icon: Receipt },
    { key: 'custodies', label: 'عهد المشروع', count: recentCustodies.length, icon: Wallet },
    { key: 'categories', label: 'بنود التكلفة المعتمدة', count: availableBudgetCategories.length, icon: Tag },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-border overflow-x-auto pb-px" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                  isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {/* TAB 1: MILESTONES */}
        {activeTab === 'milestones' && (
          <div className="space-y-4" data-testid="tab-content-milestones">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">محطات المشروع المخططة والتنفيذية</h2>
                <p className="text-xs text-muted-foreground">
                  متابعة الجدول الزمني للمحطات ونسب الإنجاز الفعلية
                </p>
              </div>
            </div>

            {milestones.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <Flag className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium text-foreground">لم يتم إضافة محطات لهذا المشروع بعد</p>
              </div>
            ) : (
              <div className="space-y-3">
                {milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                    data-testid={`milestone-item-${milestone.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{milestone.title}</span>
                        <MilestoneStatusBadge
                          status={milestone.status}
                          isOverdue={milestone.isOverdue}
                        />
                      </div>
                      {milestone.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {milestone.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                      <div className="flex items-center gap-1 font-mono">
                        <Calendar className="size-3.5" aria-hidden="true" />
                        <span>المستهدف: {milestone.targetDate}</span>
                      </div>
                      {milestone.achievedAt && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          <span>تحققت: {milestone.achievedAt.slice(0, 10)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-4" data-testid="tab-content-reports">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">تقارير التقدم الميداني للمشروع</h2>
                <p className="text-xs text-muted-foreground">
                  التقارير الميدانية التي قمت بإعدادها وتقديمها لهذا المشروع
                </p>
              </div>
              <Link
                href={`/my-reports/new?projectId=${project.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>تقرير جديد</span>
              </Link>
            </div>

            {recentReports.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <FileText className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium text-foreground">لم تقم بتقديم أي تقارير لهذا المشروع حتى الآن</p>
                <Link
                  href={`/my-reports/new?projectId=${project.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  إنشاء أول تقرير ميداني
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {recentReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-muted/30 transition-colors gap-3"
                    data-testid={`report-item-${report.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-muted-foreground">
                          {report.reportDate}
                        </span>
                        <ProgressReportStatusBadge status={report.status} />
                        {report.progressPercentage !== null && (
                          <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            الإنجاز: {report.progressPercentage}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground line-clamp-1">
                        {report.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/my-reports/${report.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                      >
                        <span>عرض التقرير</span>
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className="space-y-4" data-testid="tab-content-expenses">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">مطالبات المصاريف الميدانية</h2>
                <p className="text-xs text-muted-foreground">
                  المصاريف الميدانية المقيدة من قبلك على هذا المشروع وحالة اعتمادها
                </p>
              </div>
            </div>

            {recentExpenses.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <Receipt className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium text-foreground">لا توجد مصاريف مقيدة من قبلك على هذا المشروع</p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {recentExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-muted/30 transition-colors gap-3"
                    data-testid={`expense-item-${expense.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground font-mono">
                          {Number(expense.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
                        </span>
                        <ExpenseStatusBadge status={expense.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{expense.description}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="font-mono">
                        {new Date(expense.expenseDate).toLocaleDateString('ar-SA')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CUSTODIES */}
        {activeTab === 'custodies' && (
          <div className="space-y-4" data-testid="tab-content-custodies">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">العهد النقدية المخصصة للمشروع</h2>
                <p className="text-xs text-muted-foreground">
                  سجل العهد النقدية المرتبطة بك على هذا المشروع وحالات صرفها وتصفيتها
                </p>
              </div>
            </div>

            {recentCustodies.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <Wallet className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium text-foreground">لا توجد عهد نقدية مقيدة باسمك على هذا المشروع</p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {recentCustodies.map((custody) => (
                  <div
                    key={custody.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-muted/30 transition-colors gap-3"
                    data-testid={`custody-item-${custody.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {custody.code}
                        </span>
                        <span className="font-bold text-xs text-foreground font-mono">
                          {Number(custody.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
                        </span>
                        <CustodyStatusBadge status={custody.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{custody.purpose}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span>الأمين: {custody.custodian.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: CATEGORIES (Zero financial amounts) */}
        {activeTab === 'categories' && (
          <div className="space-y-4" data-testid="tab-content-categories">
            <div>
              <h2 className="text-sm font-bold text-foreground">دليل بنود التكلفة المعتمدة في المشروع</h2>
              <p className="text-xs text-muted-foreground">
                التصنيفات المعتمدة لإدراج وتوجيه المصاريف الميدانية والعهد (بدون أرقام أو سقوف مالية)
              </p>
            </div>

            {availableBudgetCategories.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                <Tag className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium text-foreground">لا توجد موازنة معتمدة لهذا المشروع بعد</p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {availableBudgetCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-muted/30 transition-colors gap-2"
                    data-testid={`category-item-${category.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Tag className="size-3.5 text-primary" aria-hidden="true" />
                        <span className="font-bold text-xs text-foreground">{category.category}</span>
                      </div>
                      {category.description && (
                        <p className="text-xs text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground/70 bg-muted/60 px-2 py-0.5 rounded-full shrink-0">
                      بند معتمد
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
