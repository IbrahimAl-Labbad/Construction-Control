/**
 * tests/unit/lib/operational-dashboard-mappers.test.ts
 *
 * Unit tests for Operational Project Dashboard DTO mapping and serialization.
 * Vertical Slice 13 — Operational Project Dashboard.
 */

import { describe, expect, it } from 'vitest';
import { ProjectStatus } from '@prisma/client';
import { toOperationalProjectDashboardDTO } from '@/lib/operational-dashboard/mappers';
import type { ProjectDetails } from '@/lib/projects/types';
import type { ProjectMilestoneSummaryDTO } from '@/lib/milestones/types';
import type {
  LatestProgressReportSnapshotDTO,
  ProjectOperationalFinancialDTO,
} from '@/lib/operational-dashboard/types';

describe('Operational Project Dashboard — Mappers Unit Tests', () => {
  const mockProjectDetails: ProjectDetails = {
    id: 'proj_123',
    code: 'PRJ-001',
    name: 'برج الأمل السكني',
    description: 'مشروع إنشاء برج سكني',
    location: 'الرياض',
    status: ProjectStatus.ACTIVE,
    managerId: 'user_mgr_1',
    manager: {
      id: 'user_mgr_1',
      name: 'م. أحمد العتيبي',
      email: 'ahmed@test.local',
    },
    startDate: new Date('2026-01-15T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockProgressSnapshot: LatestProgressReportSnapshotDTO = {
    reportId: 'rep_1',
    reportDate: '2026-09-25',
    title: 'تقرير إنجاز الأعمال الخرسانية',
    progressPercentage: 45,
    status: 'APPROVED',
    blockers: 'تأخر توريد حديد التسليح',
    nextPeriodPlan: 'استكمال صب الدور الرابع',
    createdBy: {
      id: 'eng_1',
      name: 'م. فهد القرني',
    },
    daysSinceReport: 2,
  };

  const mockMilestoneSummary: ProjectMilestoneSummaryDTO = {
    projectId: 'proj_123',
    totalCount: 10,
    completedCount: 3,
    inProgressCount: 2,
    plannedCount: 5,
    overdueCount: 1,
    nextUpcomingMilestone: {
      id: 'ms_1',
      title: 'اكتمال صب الخرسانة',
      targetDate: '2026-10-15',
    },
  };

  const mockFinancialSummary: ProjectOperationalFinancialDTO = {
    hasApprovedBudget: true,
    authorizedBudget: '1000000.00',
    actualSpend: '250000.00',
    totalActiveExposure: '400000.00',
    availableBalance: '600000.00',
    pendingExposure: '50000.00',
    projectedBalance: '550000.00',
    currency: 'SAR',
  };

  it('assembles a complete, client-safe OperationalProjectDashboardDTO', () => {
    const generatedAt = '2026-09-27T08:00:00.000Z';
    const dto = toOperationalProjectDashboardDTO({
      projectId: 'proj_123',
      generatedAt,
      identityProject: mockProjectDetails,
      latestProgress: mockProgressSnapshot,
      milestoneSummary: mockMilestoneSummary,
      activeEngineerCount: 4,
      financialSummary: mockFinancialSummary,
    });

    expect(dto.projectId).toBe('proj_123');
    expect(dto.generatedAt).toBe(generatedAt);

    // Identity check
    expect(dto.identity.code).toBe('PRJ-001');
    expect(dto.identity.name).toBe('برج الأمل السكني');
    expect(dto.identity.status).toBe('ACTIVE');
    expect(dto.identity.managerName).toBe('م. أحمد العتيبي');
    expect(dto.identity.startDate).toBe('2026-01-15');
    expect(dto.identity.endDate).toBe('2026-12-31');

    // Strict invariant: NO managerId in identity DTO
    expect((dto.identity as Record<string, unknown>)['managerId']).toBeUndefined();

    // Progress check
    expect(dto.progress).not.toBeNull();
    expect(dto.progress?.reportId).toBe('rep_1');
    expect(dto.progress?.progressPercentage).toBe(45);
    expect(dto.progress?.createdBy.name).toBe('م. فهد القرني');
    expect((dto.progress?.createdBy as Record<string, unknown>)['email']).toBeUndefined();

    // Milestones check
    expect(dto.milestones.totalCount).toBe(10);
    expect(dto.milestones.overdueCount).toBe(1);
    expect(dto.milestones.nextUpcomingMilestone?.title).toBe('اكتمال صب الخرسانة');

    // Team check
    expect(dto.team.activeEngineerCount).toBe(4);

    // Financial check
    expect(dto.financial.hasApprovedBudget).toBe(true);
    expect(dto.financial.authorizedBudget).toBe('1000000.00');
    expect(dto.financial.actualSpend).toBe('250000.00');
    expect(dto.financial.totalActiveExposure).toBe('400000.00');
    expect(dto.financial.availableBalance).toBe('600000.00');
    expect(dto.financial.pendingExposure).toBe('50000.00');
    expect(dto.financial.projectedBalance).toBe('550000.00');
    expect(dto.financial.currency).toBe('SAR');
  });

  it('handles null progress report safely when no approved report exists', () => {
    const dto = toOperationalProjectDashboardDTO({
      projectId: 'proj_123',
      generatedAt: '2026-09-27T08:00:00.000Z',
      identityProject: mockProjectDetails,
      latestProgress: null,
      milestoneSummary: mockMilestoneSummary,
      activeEngineerCount: 0,
      financialSummary: mockFinancialSummary,
    });

    expect(dto.progress).toBeNull();
  });

  it('handles projects without dates safely (startDate/endDate null)', () => {
    const noDatesProject: ProjectDetails = {
      ...mockProjectDetails,
      startDate: null,
      endDate: null,
    };

    const dto = toOperationalProjectDashboardDTO({
      projectId: 'proj_123',
      generatedAt: '2026-09-27T08:00:00.000Z',
      identityProject: noDatesProject,
      latestProgress: null,
      milestoneSummary: mockMilestoneSummary,
      activeEngineerCount: 2,
      financialSummary: mockFinancialSummary,
    });

    expect(dto.identity.startDate).toBeNull();
    expect(dto.identity.endDate).toBeNull();
  });

  it('handles empty-budget and zero-lines financial summary representations', () => {
    const zeroLinesFinancial: ProjectOperationalFinancialDTO = {
      hasApprovedBudget: true,
      authorizedBudget: '0.00',
      actualSpend: '0.00',
      totalActiveExposure: '0.00',
      availableBalance: '0.00',
      pendingExposure: '0.00',
      projectedBalance: '0.00',
      currency: 'SAR',
    };

    const dto = toOperationalProjectDashboardDTO({
      projectId: 'proj_123',
      generatedAt: '2026-09-27T08:00:00.000Z',
      identityProject: mockProjectDetails,
      latestProgress: null,
      milestoneSummary: mockMilestoneSummary,
      activeEngineerCount: 0,
      financialSummary: zeroLinesFinancial,
    });

    expect(dto.financial.hasApprovedBudget).toBe(true);
    expect(dto.financial.authorizedBudget).toBe('0.00');
    expect(dto.financial.totalActiveExposure).toBe('0.00');
  });
});
