/**
 * tests/integration/milestone-soft-delete-guard.test.ts
 *
 * Integration tests for Milestone Soft-Delete Protection Guard (CR-08 / BD-17 / Requirement 7).
 *
 * Verifies:
 * 1. deleteMilestone on a PLANNED milestone with >= 1 linked report throws MILESTONE_HAS_LINKED_REPORTS.
 * 2. Unlinking the report, then re-attempting deleteMilestone succeeds.
 */

import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  ProgressReportStatus,
  MilestoneStatus,
  AssignmentStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  deleteMilestone,
  linkProgressReport,
  unlinkProgressReport,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Soft-Delete Guard (Live DB)', () => {
  let managerUser: AuthenticatedUser;
  let engineerUser: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير حذف المحطات',
        email: `mgr.del.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    managerUser = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Engineer
    const eng = await prisma.user.create({
      data: {
        name: 'مهندس حذف المحطات',
        email: `eng.del.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng.id);
    engineerUser = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-DEL-${Date.now().toString().slice(-4)}`,
        name: 'مشروع حماية الحذف',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = { id: prj.id };

    // 4. Assign Engineer
    await prisma.projectAssignment.create({
      data: {
        projectId: prj.id,
        engineerId: eng.id,
        status: AssignmentStatus.ACTIVE,
        assignedById: mgr.id,
      },
    });

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(managerUser);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(managerUser);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (cleanupProjectIds.length > 0) {
      await prisma.progressReportMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.progressReport.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.projectMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.projectAssignment.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: cleanupProjectIds } },
      });
    }

    if (cleanupUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: cleanupUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
  });

  it('rejects soft deletion of a PLANNED milestone with linked reports, and allows deletion after unlinking', async () => {
    // 1. Create a planned milestone
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مرتبطة بتقرير',
      targetDate: '2026-12-01',
    });

    // 2. Create a progress report and link it
    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-20'),
        title: 'تقرير للمحطة المرتبطة',
        workDescription: 'أعمال تأسيس',
        status: ProgressReportStatus.DRAFT,
        createdById: engineerUser.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: report.id,
    });

    // 3. Attempt deleteMilestone -> must fail with MILESTONE_HAS_LINKED_REPORTS
    let thrownError: AppError | null = null;
    try {
      await deleteMilestone(milestone.id);
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('MILESTONE_HAS_LINKED_REPORTS');

    // Verify milestone is still active in DB
    const stillActive = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });
    expect(stillActive.deletedAt).toBeNull();
    expect(stillActive.status).toBe(MilestoneStatus.PLANNED);

    // 4. Explicitly unlink the report
    const unlinkRes = await unlinkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: report.id,
    });
    expect(unlinkRes.success).toBe(true);

    // 5. Re-attempt deleteMilestone -> must succeed
    const deleteRes = await deleteMilestone(milestone.id);
    expect(deleteRes.success).toBe(true);

    // Verify milestone is now soft-deleted in DB
    const softDeleted = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });
    expect(softDeleted.deletedAt).not.toBeNull();
  });

  it('concurrently executes linkProgressReport and deleteMilestone on real PostgreSQL and proves strict serialization', async () => {
    // Run multiple concurrent races to test thread interleaving under real PostgreSQL row-locks
    for (let i = 0; i < 5; i++) {
      const milestone = await createMilestone({
        projectId: testProject.id,
        title: `محطة سباق متزامن ${i}`,
        targetDate: '2026-12-01',
      });

      const report = await prisma.progressReport.create({
        data: {
          projectId: testProject.id,
          reportDate: new Date(Date.UTC(2026, 9, 1 + i)),
          title: `تقرير سباق متزامن ${i}`,
          workDescription: 'أعمال هيكل خرساني',
          status: ProgressReportStatus.DRAFT,
          createdById: engineerUser.id,
        },
      });

      // Fire both transactions concurrently on real PostgreSQL connections
      const [linkResult, deleteResult] = await Promise.allSettled([
        linkProgressReport({
          projectId: testProject.id,
          milestoneId: milestone.id,
          reportId: report.id,
        }),
        deleteMilestone(milestone.id),
      ]);

      // Exactly one must succeed and one must fail
      const linkSucceeded = linkResult.status === 'fulfilled';
      const deleteSucceeded = deleteResult.status === 'fulfilled';

      expect(linkSucceeded !== deleteSucceeded).toBe(true);

      const dbMilestone = await prisma.projectMilestone.findUniqueOrThrow({
        where: { id: milestone.id },
      });

      const dbLinkages = await prisma.progressReportMilestone.findMany({
        where: { milestoneId: milestone.id, reportId: report.id },
      });

      if (linkSucceeded) {
        // Outcome A: Linkage committed first
        expect(deleteResult.status).toBe('rejected');
        const delError = (deleteResult as PromiseRejectedResult).reason as AppError;
        expect(delError.code).toBe('MILESTONE_HAS_LINKED_REPORTS');

        // Milestone remains active and not deleted
        expect(dbMilestone.deletedAt).toBeNull();
        expect(dbMilestone.status).toBe(MilestoneStatus.PLANNED);

        // Linkage exists and is intact
        expect(dbLinkages).toHaveLength(1);
      } else {
        // Outcome B: Deletion committed first
        expect(linkResult.status).toBe('rejected');
        const linkError = (linkResult as PromiseRejectedResult).reason as AppError;
        expect(['NOT_FOUND', 'INVALID_STATE_TRANSITION']).toContain(linkError.code);

        // Milestone is soft-deleted
        expect(dbMilestone.deletedAt).not.toBeNull();

        // No linkage can exist on a soft-deleted milestone
        expect(dbLinkages).toHaveLength(0);
      }
    }
  });

  it('proves Outcome A: linkage commits before deletion -> deletion is blocked and linkage preserved', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة سيناريو أ',
      targetDate: '2026-12-01',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-21'),
        title: 'تقرير سيناريو أ',
        workDescription: 'أعمال عزل',
        status: ProgressReportStatus.DRAFT,
        createdById: engineerUser.id,
      },
    });

    // 1. Linkage commits
    const linkRes = await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: report.id,
    });
    expect(linkRes.success).toBe(true);

    // 2. Deletion must fail with MILESTONE_HAS_LINKED_REPORTS
    let delError: AppError | null = null;
    try {
      await deleteMilestone(milestone.id);
    } catch (err) {
      delError = err as AppError;
    }

    expect(delError).toBeInstanceOf(AppError);
    expect(delError?.code).toBe('MILESTONE_HAS_LINKED_REPORTS');

    // 3. Verify final DB state: milestone active, linkage intact
    const finalMilestone = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });
    expect(finalMilestone.deletedAt).toBeNull();

    const finalLinks = await prisma.progressReportMilestone.findMany({
      where: { milestoneId: milestone.id },
    });
    expect(finalLinks).toHaveLength(1);
    expect(finalLinks[0]?.reportId).toBe(report.id);
  });

  it('proves Outcome B: deletion commits before linkage -> linkage is rejected and no link can exist on soft-deleted milestone', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة سيناريو ب',
      targetDate: '2026-12-01',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-22'),
        title: 'تقرير سيناريو ب',
        workDescription: 'أعمال تمديدات',
        status: ProgressReportStatus.DRAFT,
        createdById: engineerUser.id,
      },
    });

    // 1. Deletion commits first
    const delRes = await deleteMilestone(milestone.id);
    expect(delRes.success).toBe(true);

    const deletedMilestone = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });
    expect(deletedMilestone.deletedAt).not.toBeNull();

    // 2. Linkage attempt on soft-deleted milestone must fail
    let linkError: AppError | null = null;
    try {
      await linkProgressReport({
        projectId: testProject.id,
        milestoneId: milestone.id,
        reportId: report.id,
      });
    } catch (err) {
      linkError = err as AppError;
    }

    expect(linkError).toBeInstanceOf(AppError);
    expect(linkError?.code).toBe('NOT_FOUND');

    // 3. Verify final DB state: zero links exist
    const finalLinks = await prisma.progressReportMilestone.findMany({
      where: { milestoneId: milestone.id },
    });
    expect(finalLinks).toHaveLength(0);
  });
});
