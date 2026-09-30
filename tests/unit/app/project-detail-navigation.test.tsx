/**
 * tests/unit/app/project-detail-navigation.test.tsx
 *
 * Slice 16 — Project Detail Navigation Buttons Unit Test.
 *
 * Verifies that ProjectDetailsPage renders navigation buttons for:
 * - /projects/[projectId]/custodies (data-testid="project-custodies-button")
 * - /projects/[projectId]/payroll (data-testid="project-payroll-button")
 * - /projects/[projectId]/progress (data-testid="project-progress-button")
 * in addition to existing buttons (budget, commitments, expenses, team, milestones).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectDetailsPage from '@/app/(manager)/projects/[projectId]/page';
import * as operationalDashboard from '@/lib/operational-dashboard';
import type { OperationalProjectDashboardDTO } from '@/lib/operational-dashboard';
import * as permissions from '@/lib/permissions';
import { Role, ProjectStatus } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        managerId: 'mgr-1',
        location: 'الرياض',
        description: 'وصف المشروع',
      }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/permissions', () => ({
  requireManager: vi.fn(),
  requireRole: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/projects', () => ({
  getAllowedNextStatuses: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/operational-dashboard', () => ({
  getProjectOperationalDashboard: vi.fn(),
}));

vi.mock('@/app/(manager)/projects/[projectId]/components/operational-dashboard-view', () => ({
  OperationalDashboardView: () => <div data-testid="operational-dashboard-view">Dashboard View</div>,
}));

vi.mock('@/app/(manager)/projects/components/project-status-badge', () => ({
  ProjectStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock('@/app/(manager)/projects/components/change-status-dialog', () => ({
  ChangeStatusDialog: () => <div data-testid="change-status-dialog">Dialog</div>,
}));

vi.mock('@/app/(manager)/projects/components/assign-manager-dialog', () => ({
  AssignManagerDialog: () => <div data-testid="assign-manager-dialog">Dialog</div>,
}));

describe('ProjectDetailsPage Navigation Buttons (Slice 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders custodies, payroll, and progress navigation buttons with correct hrefs', async () => {
    vi.mocked(permissions.requireManager).mockResolvedValue({
      id: 'mgr-1',
      name: 'مدير النظام',
      email: 'mgr@test.local',
      role: Role.MANAGER,
      isActive: true,
    } as unknown as AuthenticatedUser);

    vi.mocked(operationalDashboard.getProjectOperationalDashboard).mockResolvedValue({
      projectId: 'proj-123',
      identity: {
        id: 'proj-123',
        code: 'PRJ-123',
        name: 'مشروع برج الرياض',
        status: ProjectStatus.ACTIVE,
        managerId: 'mgr-1',
        managerName: 'مدير النظام',
      },
      team: {
        activeEngineerCount: 3,
        engineers: [],
      },
      milestones: {
        totalCount: 5,
        completedCount: 2,
        inProgressCount: 1,
        delayedCount: 0,
        milestones: [],
      },
      financialSummary: {
        totalBudget: '1000000.00',
        actualSpend: '200000.00',
        activeExposure: '500000.00',
        availableBalance: '300000.00',
        pendingExposure: '50000.00',
        projectedBalance: '250000.00',
      },
      progressSummary: {
        submittedReportsCount: 4,
        latestReport: null,
      },
      governanceAlerts: [],
    } as unknown as OperationalProjectDashboardDTO);

    const PageComponent = await ProjectDetailsPage({
      params: Promise.resolve({ projectId: 'proj-123' }),
    });

    render(PageComponent);

    // Verify existing buttons
    expect(screen.getByTestId('project-budget-button').getAttribute('href')).toBe('/projects/proj-123/budget');
    expect(screen.getByTestId('project-commitments-button').getAttribute('href')).toBe('/projects/proj-123/commitments');
    expect(screen.getByTestId('project-expenses-button').getAttribute('href')).toBe('/projects/proj-123/expenses');
    expect(screen.getByTestId('project-team-button').getAttribute('href')).toBe('/projects/proj-123/team');
    expect(screen.getByTestId('project-milestones-button').getAttribute('href')).toBe('/projects/proj-123/milestones');

    // Verify Slice 16 new buttons
    const custodiesButton = screen.getByTestId('project-custodies-button');
    expect(custodiesButton.getAttribute('href')).toBe('/projects/proj-123/custodies');
    expect(custodiesButton.textContent).toContain('العهد النقدية');

    const payrollButton = screen.getByTestId('project-payroll-button');
    expect(payrollButton.getAttribute('href')).toBe('/projects/proj-123/payroll');
    expect(payrollButton.textContent).toContain('الأجور والعمالة');

    const progressButton = screen.getByTestId('project-progress-button');
    expect(progressButton.getAttribute('href')).toBe('/projects/proj-123/progress');
    expect(progressButton.textContent).toContain('تقارير التقدم');
  });
});
