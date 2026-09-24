/**
 * app/(manager)/dashboard/components/project-financial-table.tsx
 *
 * Renders the per-project financial summary table.
 *
 * BD-22: All non-deleted projects appear, all five statuses represented.
 * BD-31: activeExposure and actualSpend have distinct column headers.
 * BD-33: No worker fields, no PII, no individual amounts — aggregate only.
 * BD-36: No approval actions, no mutations.
 * BD-35: No date/period filter.
 *
 * Projects without an approved budget display:
 *   "لا توجد موازنة معتمدة" in all financial cells.
 *
 * No financial calculations in this component — values come pre-computed.
 * Pure Server Component.
 */

import Link from 'next/link';
import type { ProjectFinancialSummaryDTO } from '@/lib/dashboard/types';
import type { ProjectStatus } from '@prisma/client';

interface ProjectFinancialTableProps {
  projects: ProjectFinancialSummaryDTO[];
}

/** Formats a SAR amount string for Arabic display */
function formatSAR(amount: string): string {
  const num = parseFloat(amount);
  return (
    new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num) + '\u00a0ر.س'
  );
}

/** Returns the Tailwind classes for a project status badge */
function statusBadgeClasses(status: ProjectStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
    case 'PLANNED':
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    case 'ON_HOLD':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'COMPLETED':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    case 'CANCELLED':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Arabic label for each project status */
function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'نشط';
    case 'PLANNED':
      return 'مخطط';
    case 'ON_HOLD':
      return 'متوقف';
    case 'COMPLETED':
      return 'مكتمل';
    case 'CANCELLED':
      return 'ملغى';
    default:
      return status;
  }
}

/** Cell content for a project without an approved budget */
function NoBudgetCell() {
  return (
    <span className="text-xs text-muted-foreground/60 italic">
      لا توجد موازنة معتمدة
    </span>
  );
}

/** Financial amount cell */
function AmountCell({
  amount,
  colorClass = 'text-foreground',
  testIdSuffix,
}: {
  amount: string;
  colorClass?: string;
  testIdSuffix?: string;
}) {
  return (
    <span className={`amount text-sm font-medium ${colorClass}`} data-testid={testIdSuffix}>
      {formatSAR(amount)}
    </span>
  );
}

export function ProjectFinancialTable({ projects }: ProjectFinancialTableProps) {
  if (projects.length === 0) {
    return (
      <section aria-label="المشاريع">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          المشاريع
        </h2>
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            لا توجد مشاريع مسجلة
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="المشاريع">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        المشاريع — الملخص المالي ({projects.length.toLocaleString('ar-SA')} مشروع)
      </h2>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            data-testid="project-financial-table"
          >
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  المشروع
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  الحالة
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  الموازنة المعتمدة
                </th>
                {/* BD-31: Actual Spend column is distinct from Active Exposure */}
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  المصروفات الفعلية
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  إجمالي الارتباطات
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  الرصيد المتاح
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  التعرض المعلق
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  الرصيد المتوقع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((project) => (
                <tr
                  key={project.projectId}
                  className="hover:bg-muted/20 transition-colors"
                  data-testid={`project-row-${project.projectId}`}
                >
                  {/* Project code + name — links to project detail */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/projects/${project.projectId}`}
                      className="group flex flex-col gap-0.5"
                    >
                      <span className="font-mono text-xs font-semibold text-primary group-hover:underline">
                        {project.projectCode}
                      </span>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {project.projectName}
                      </span>
                    </Link>
                  </td>

                  {/* Project status badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClasses(project.projectStatus)}`}
                      data-testid={`project-status-${project.projectId}`}
                    >
                      {statusLabel(project.projectStatus)}
                    </span>
                  </td>

                  {/* Financial columns — show empty state if no approved budget */}
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.authorizedBudget}
                        colorClass="text-primary"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>

                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.actualSpend}
                        colorClass="text-emerald-700 dark:text-emerald-400"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>

                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.activeExposure}
                        colorClass="text-amber-700 dark:text-amber-400"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>

                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.availableBalance}
                        colorClass="text-blue-700 dark:text-blue-400"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>

                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.pendingExposure}
                        colorClass="text-orange-700 dark:text-orange-400"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>

                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {project.hasApprovedBudget ? (
                      <AmountCell
                        amount={project.projectedBalance}
                        colorClass="text-violet-700 dark:text-violet-400"
                      />
                    ) : (
                      <NoBudgetCell />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
