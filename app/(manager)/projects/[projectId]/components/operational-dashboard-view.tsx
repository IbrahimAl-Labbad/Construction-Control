import type { OperationalProjectDashboardDTO } from '@/lib/operational-dashboard/types';
import { OperationalFinancialCard } from './operational-financial-card';
import { OperationalMilestonesCard } from './operational-milestones-card';
import { OperationalProgressCard } from './operational-progress-card';
import { OperationalTeamCard } from './operational-team-card';

interface OperationalDashboardViewProps {
  data: OperationalProjectDashboardDTO;
}

export function OperationalDashboardView({ data }: OperationalDashboardViewProps) {
  return (
    <div
      className="space-y-6"
      data-testid="operational-dashboard-view"
    >
      {/* 1. Financial Read Model Overview */}
      <OperationalFinancialCard
        financial={data.financial}
        projectId={data.projectId}
      />

      {/* 2. Operational Signals: Milestones & Site Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OperationalMilestonesCard
          milestones={data.milestones}
          projectId={data.projectId}
        />
        <OperationalProgressCard
          progress={data.progress}
          projectId={data.projectId}
        />
      </div>

      {/* 3. Team Overview */}
      <OperationalTeamCard
        team={data.team}
        projectId={data.projectId}
      />
    </div>
  );
}
