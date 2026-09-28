import Link from 'next/link';
import { Users, ArrowUpRight, UserCheck } from 'lucide-react';
import type { ProjectTeamSnapshotDTO } from '@/lib/operational-dashboard/types';

interface OperationalTeamCardProps {
  team: ProjectTeamSnapshotDTO;
  projectId: string;
}

export function OperationalTeamCard({
  team,
  projectId,
}: OperationalTeamCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
      data-testid="operational-team-card"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Users className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              فريق العمل الهندسي في الموقع
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              مهندسو الموقع النشطون المعينون رسمياً لإدارة الأعمال اليومية
            </p>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/team`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <span>سجل التعيينات</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-lg border border-border/80 bg-muted/20 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
            <UserCheck className="size-4" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">
              إجمالي مهندسي الموقع المعينين (نشط)
            </span>
            <span
              className="text-2xl font-bold font-mono text-foreground"
              data-testid="active-engineer-count-value"
            >
              <span data-testid="project-engineers-count">{team.activeEngineerCount}</span>
            </span>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/team`}
          className="text-xs font-medium text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
        >
          عرض الفريق والتفاصيل
        </Link>
      </div>
    </div>
  );
}
