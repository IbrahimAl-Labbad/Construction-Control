/**
 * tests/integration/operational-dashboard-orchestration.test.ts
 *
 * Full integration tests for getProjectOperationalDashboard().
 * Live PostgreSQL. Verifies end-to-end orchestration across all 5 domain branches.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  AssignmentStatus,
  MilestoneStatus,
  ProgressReportStatus,
  ProjectStatus,
  Role,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getProjectOperationalDashboard } from '@/lib/operational-dashboard';
import { getProjectMilestoneSummary } from '@/lib/milestones/queries/get-project-milestone-summary';
import { getActiveProjectEngineerCount } from '@/lib/project-team/queries/get-active-project-engineer-count';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Operational Project Dashboard — Orchestration Integration', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testProjectId: string;
  let otherProjectId: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    // 1. Create Manager & Engineer
    const mgr = await prisma.user.create({
      data: {
        name: `مدير عام التشغيل ${timestamp}`,
        email: `op.mgr.${timestamp}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });

    const eng = await prisma.user.create({
      data: {
        name: `مهندس الموقع ${timestamp}`,
        email: `op.eng.${timestamp}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });

    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    // 2. Create Target Project
    const project = await prisma.project.create({
      data: {
        code: `ORCH-${timestamp}`,
        name: `مشروع الأوركسترا ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    testProjectId = project.id;

    // 3. Create Other Project (for cross-project scoping tests)
    const otherProject = await prisma.project.create({
      data: {
        code: `OTH-${timestamp}`,
        name: `مشروع آخر للمقارنة ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    otherProjectId = otherProject.id;

    // 4. Assign Engineer to Target Project
    await prisma.projectAssignment.create({
      data: {
        projectId: testProjectId,
        engineerId: testEngineer.id,
        status: AssignmentStatus.ACTIVE,
        assignedById: testManager.id,
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.progressReport.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.projectMilestone.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.projectAssignment.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'op.mgr' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'op.eng' } },
    });
  });

  it('TC-ORCH-01: retrieves complete dashboard with all 5 sections populated', async () => {
    // Add approved progress report
    await prisma.progressReport.create({
      data: {
        projectId: testProjectId,
        reportDate: new Date('2026-09-20'),
        title: 'تقرير الأساسات الخرسانية',
        workDescription: 'تم الانتهاء من صب القواعد المسلحة بالكامل',
        progressPercentage: 35,
        status: ProgressReportStatus.APPROVED,
        blockers: 'لا توجد معوقات حرجة',
        nextPeriodPlan: 'البدء في أعمال الأعمدة',
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // Add milestones
    await prisma.projectMilestone.create({
      data: {
        projectId: testProjectId,
        title: 'صب القواعد المسلحة',
        targetDate: new Date('2026-09-15'),
        status: MilestoneStatus.COMPLETED,
        orderIndex: 0,
        createdById: testManager.id,
      },
    });

    await prisma.projectMilestone.create({
      data: {
        projectId: testProjectId,
        title: 'أعمدة الدور الأرضي',
        targetDate: new Date('2026-10-30'),
        status: MilestoneStatus.IN_PROGRESS,
        orderIndex: 1,
        createdById: testManager.id,
      },
    });

    const result = await getProjectOperationalDashboard(testProjectId);

    expect(result.projectId).toBe(testProjectId);
    expect(typeof result.generatedAt).toBe('string');

    // Section 1: Identity
    expect(result.identity.code).toContain('ORCH-');
    expect(result.identity.status).toBe('ACTIVE');
    expect(result.identity.managerName).toBe(testManager.name);

    // Section 2: Progress
    expect(result.progress).not.toBeNull();
    expect(result.progress?.title).toBe('تقرير الأساسات الخرسانية');
    expect(result.progress?.progressPercentage).toBe(35);
    expect(result.progress?.createdBy.name).toBe(testEngineer.name);
    expect(result.progress?.status).toBe('APPROVED');

    // Section 3: Milestones
    expect(result.milestones.totalCount).toBe(2);
    expect(result.milestones.completedCount).toBe(1);
    expect(result.milestones.inProgressCount).toBe(1);
    expect(result.milestones.nextUpcomingMilestone?.title).toBe('أعمدة الدور الأرضي');

    // Section 4: Team
    expect(result.team.activeEngineerCount).toBe(1);

    // Section 5: Financial (no budget)
    expect(result.financial.hasApprovedBudget).toBe(false);
    expect(result.financial.currency).toBe('SAR');
  });

  it('TC-ORCH-02 & TC-ORCH-03: returns strictly the latest APPROVED report and is not displaced by a newer SUBMITTED report', async () => {
    // 1. Older APPROVED report
    await prisma.progressReport.create({
      data: {
        projectId: testProjectId,
        reportDate: new Date('2026-09-10'),
        title: 'تقرير معتمد قديم',
        workDescription: 'أعمال قديمة معتمدة',
        status: ProgressReportStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // 2. Newer APPROVED report
    const latestApproved = await prisma.progressReport.create({
      data: {
        projectId: testProjectId,
        reportDate: new Date('2026-09-22'),
        title: 'تقرير معتمد أحدث',
        workDescription: 'أعمال أحدث معتمدة',
        status: ProgressReportStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    // 3. Even newer SUBMITTED report (must NOT replace the latest approved report)
    await prisma.progressReport.create({
      data: {
        projectId: testProjectId,
        reportDate: new Date('2026-09-25'),
        title: 'تقرير قيد المراجعة جديد',
        workDescription: 'أعمال قيد المراجعة',
        status: ProgressReportStatus.SUBMITTED,
        createdById: testEngineer.id,
        submittedAt: new Date(),
      },
    });

    // 4. Report from OTHER project (must be ignored)
    await prisma.progressReport.create({
      data: {
        projectId: otherProjectId,
        reportDate: new Date('2026-09-26'),
        title: 'تقرير مشروع آخر',
        workDescription: 'أعمال مشروع آخر',
        status: ProgressReportStatus.APPROVED,
        createdById: testEngineer.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    const result = await getProjectOperationalDashboard(testProjectId);

    expect(result.progress).not.toBeNull();
    expect(result.progress?.reportId).toBe(latestApproved.id);
    expect(result.progress?.title).toBe('تقرير معتمد أحدث');
    expect(result.progress?.reportDate).toBe('2026-09-22');
  });

  it('TC-ORCH-04: milestone summary matches Slice 12 getProjectMilestoneSummary() independently', async () => {
    await prisma.projectMilestone.create({
      data: {
        projectId: testProjectId,
        title: 'تسليم الموقع',
        targetDate: new Date('2026-08-01'),
        status: MilestoneStatus.COMPLETED,
        orderIndex: 0,
        createdById: testManager.id,
      },
    });

    const dashboard = await getProjectOperationalDashboard(testProjectId);
    const directMilestones = await getProjectMilestoneSummary(testProjectId);

    expect(dashboard.milestones.totalCount).toBe(directMilestones.totalCount);
    expect(dashboard.milestones.completedCount).toBe(directMilestones.completedCount);
    expect(dashboard.milestones.inProgressCount).toBe(directMilestones.inProgressCount);
    expect(dashboard.milestones.plannedCount).toBe(directMilestones.plannedCount);
    expect(dashboard.milestones.overdueCount).toBe(directMilestones.overdueCount);
    expect(dashboard.milestones.nextUpcomingMilestone).toEqual(
      directMilestones.nextUpcomingMilestone,
    );
  });

  it('TC-ORCH-05: active engineer count matches Slice 11 getActiveProjectEngineerCount()', async () => {
    const dashboard = await getProjectOperationalDashboard(testProjectId);
    const directTeamCount = await getActiveProjectEngineerCount(testProjectId);

    expect(dashboard.team.activeEngineerCount).toBe(directTeamCount);
    expect(dashboard.team.activeEngineerCount).toBe(1);
  });

  it('TC-ORCH-06: works gracefully for COMPLETED and ON_HOLD projects without errors', async () => {
    // Test ON_HOLD
    await prisma.project.update({
      where: { id: testProjectId },
      data: { status: ProjectStatus.ON_HOLD },
    });

    let dashboard = await getProjectOperationalDashboard(testProjectId);
    expect(dashboard.identity.status).toBe('ON_HOLD');

    // Test COMPLETED
    await prisma.project.update({
      where: { id: testProjectId },
      data: { status: ProjectStatus.COMPLETED },
    });

    dashboard = await getProjectOperationalDashboard(testProjectId);
    expect(dashboard.identity.status).toBe('COMPLETED');
  });

  it('TC-ORCH-07: reading the dashboard produces ZERO AuditLog records (BD-13-19)', async () => {
    const auditCountBefore = await prisma.auditLog.count({
      where: { entityId: testProjectId },
    });

    await getProjectOperationalDashboard(testProjectId);

    const auditCountAfter = await prisma.auditLog.count({
      where: { entityId: testProjectId },
    });

    expect(auditCountAfter).toBe(auditCountBefore);
  });
});
