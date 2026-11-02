/**
 * tests/integration/milestone-linkage-sync.test.ts
 *
 * Integration tests for Unified Linkage Synchronization Service & 7-Case Matrix (CR-08 / BD-17 / §7.2.4).
 *
 * 7-Case Matrix:
 * - Case 1: milestoneIds === undefined -> existing linkages remain unchanged.
 * - Case 2: milestoneIds === [] -> unlinks all permitted milestones, emitting MILESTONE_REPORT_UNLINKED.
 * - Case 3: milestoneIds === new array -> synchronizes linkages (adds new, removes omitted, retains existing).
 * - Case 4: attempting to omit or unlink a COMPLETED milestone -> fails with MILESTONE_COMPLETED_IMMUTABLE.
 * - Case 5: retaining an existing link -> executes as idempotent no-op without duplicate audit logs.
 * - Case 6: direct linkage creation -> creates linkage and MILESTONE_REPORT_LINKED audit log.
 * - Case 7: Manager unlinks a CANCELLED report from a PLANNED or IN_PROGRESS milestone -> succeeds.
 */

import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  ProgressReportStatus,
  AssignmentStatus,
  AttachmentOwnerType,
  AttachmentCategory,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  completeMilestone,
  linkProgressReport,
  syncReportMilestoneLinkages,
  acquireMilestoneLinkageLocks,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Linkage Synchronization Service Matrix (Live DB)', () => {
  let managerUser: AuthenticatedUser;
  let assignedEngineer: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير المزامنة',
        email: `mgr.sync.${Date.now()}.${Math.random()}@test.local`,
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
        name: 'مهندس المزامنة',
        email: `eng.sync.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng.id);
    assignedEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-SYN-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار المزامنة',
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
      await prisma.attachment.deleteMany({
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

  it('Case 1: targetMilestoneIds === undefined leaves existing linkages untouched', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة 1',
      targetDate: '2026-11-10',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير للمزامنة 1',
        workDescription: 'أعمال',
        status: ProgressReportStatus.DRAFT,
        createdById: assignedEngineer.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m1.id,
      reportId: report.id,
    });

    const result = await prisma.$transaction(async (tx) => {
      const lockedContext = await acquireMilestoneLinkageLocks(tx, {
        projectId: testProject.id,
        reportId: report.id,
      });

      return syncReportMilestoneLinkages(tx, {
        actor: assignedEngineer,
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: undefined,
        lockedContext,
      });
    });

    expect(result.linkedCount).toBe(0);
    expect(result.unlinkedCount).toBe(0);
    expect(result.retainedCount).toBe(1);
    expect(result.currentMilestoneIds).toEqual([m1.id]);
  });

  it('Case 2: targetMilestoneIds === [] unlinks all permitted milestones and emits audit logs', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة أ للحذف الكامل',
      targetDate: '2026-11-10',
    });
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة ب للحذف الكامل',
      targetDate: '2026-11-12',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير للمزامنة 2',
        workDescription: 'أعمال',
        status: ProgressReportStatus.DRAFT,
        createdById: assignedEngineer.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m1.id,
      reportId: report.id,
    });
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m2.id,
      reportId: report.id,
    });

    const result = await prisma.$transaction(async (tx) => {
      const lockedContext = await acquireMilestoneLinkageLocks(tx, {
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [],
      });

      return syncReportMilestoneLinkages(tx, {
        actor: assignedEngineer,
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [],
        lockedContext,
      });
    });

    expect(result.unlinkedCount).toBe(2);
    expect(result.currentMilestoneIds).toEqual([]);

    // Check remaining in DB
    const remaining = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id },
    });
    expect(remaining.length).toBe(0);

    // Verify MILESTONE_REPORT_UNLINKED audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'MILESTONE_REPORT_UNLINKED',
        entityType: 'PROGRESS_REPORT_MILESTONE',
      },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it('Case 3: targetMilestoneIds array synchronizes linkages (adds new, removes omitted, retains existing)', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة للاحتفاظ',
      targetDate: '2026-11-10',
    });
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة للإزالة',
      targetDate: '2026-11-12',
    });
    const m3 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة للإضافة',
      targetDate: '2026-11-14',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير للمزامنة 3',
        workDescription: 'أعمال',
        status: ProgressReportStatus.DRAFT,
        createdById: assignedEngineer.id,
      },
    });

    // Initial links: m1 and m2
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m1.id,
      reportId: report.id,
    });
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m2.id,
      reportId: report.id,
    });

    // Target links: m1 and m3 (m2 omitted -> unlinked; m3 new -> linked; m1 retained -> no-op)
    const result = await prisma.$transaction(async (tx) => {
      const lockedContext = await acquireMilestoneLinkageLocks(tx, {
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [m1.id, m3.id],
      });

      return syncReportMilestoneLinkages(tx, {
        actor: assignedEngineer,
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [m1.id, m3.id],
        lockedContext,
      });
    });

    expect(result.linkedCount).toBe(1);
    expect(result.unlinkedCount).toBe(1);
    expect(result.retainedCount).toBe(1);

    const activeLinks = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id },
      select: { milestoneId: true },
    });
    const activeMilestoneIds = activeLinks.map((l) => l.milestoneId).sort();
    expect(activeMilestoneIds).toEqual([m1.id, m3.id].sort());
  });

  it('Case 4: Attempting to omit or unlink a COMPLETED milestone fails with MILESTONE_COMPLETED_IMMUTABLE', async () => {
    const completedMilestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة معتمدة ومكتملة',
      targetDate: '2026-11-10',
    });

    const approvedReport = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير المحطة المكتملة',
        workDescription: 'أعمال معتمدة',
        status: ProgressReportStatus.APPROVED,
        createdById: assignedEngineer.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Add photo
    await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: approvedReport.id,
        category: AttachmentCategory.PROGRESS_PHOTO,
        originalFileName: 'photo.jpg',
        storageKey: `test/photo/${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'f'.repeat(64),
        uploadedById: assignedEngineer.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: completedMilestone.id,
      reportId: approvedReport.id,
    });

    await completeMilestone(completedMilestone.id);

    // Now attempt to sync with empty array (which would omit the completed milestone)
    let thrownError: AppError | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const lockedContext = await acquireMilestoneLinkageLocks(tx, {
          projectId: testProject.id,
          reportId: approvedReport.id,
          targetMilestoneIds: [],
        });

        await syncReportMilestoneLinkages(tx, {
          actor: managerUser,
          projectId: testProject.id,
          reportId: approvedReport.id,
          targetMilestoneIds: [],
          lockedContext,
        });
      });
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('MILESTONE_COMPLETED_IMMUTABLE');
  });

  it('Case 5: Retaining an existing link executes as an idempotent no-op without duplicate audit logs', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة لاختبار عدم التكرار',
      targetDate: '2026-11-10',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير تجربة التكرار',
        workDescription: 'أعمال',
        status: ProgressReportStatus.DRAFT,
        createdById: assignedEngineer.id,
      },
    });

    // First link
    const res1 = await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m1.id,
      reportId: report.id,
    });

    const logsBefore = await prisma.auditLog.count({
      where: {
        action: 'MILESTONE_REPORT_LINKED',
        entityId: res1.linkageId,
      },
    });
    expect(logsBefore).toBe(1);

    // Call linkProgressReport again with identical arguments
    const res2 = await linkProgressReport({
      projectId: testProject.id,
      milestoneId: m1.id,
      reportId: report.id,
    });

    expect(res2.linkageId).toBe(res1.linkageId);

    const logsAfter = await prisma.auditLog.count({
      where: {
        action: 'MILESTONE_REPORT_LINKED',
        entityId: res1.linkageId,
      },
    });
    expect(logsAfter).toBe(1); // Zero duplicate audit logs
  });

  it('Case 7: Manager unlinks a CANCELLED report from an uncompleted milestone successfully', async () => {
    const plannedMilestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مع تقرير ملغى لاحقاً',
      targetDate: '2026-11-10',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-10'),
        title: 'تقرير سيتم إلغاؤه',
        workDescription: 'أعمال',
        status: ProgressReportStatus.DRAFT,
        createdById: assignedEngineer.id,
      },
    });

    // Link report while draft
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: plannedMilestone.id,
      reportId: report.id,
    });

    // Transition report to CANCELLED
    await prisma.progressReport.update({
      where: { id: report.id },
      data: { status: ProgressReportStatus.CANCELLED },
    });

    // Manager unlinks CANCELLED report from planned milestone -> allowed!
    const result = await prisma.$transaction(async (tx) => {
      const lockedContext = await acquireMilestoneLinkageLocks(tx, {
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [],
      });

      return syncReportMilestoneLinkages(tx, {
        actor: managerUser,
        projectId: testProject.id,
        reportId: report.id,
        targetMilestoneIds: [],
        lockedContext,
      });
    });

    expect(result.unlinkedCount).toBe(1);

    const remaining = await prisma.progressReportMilestone.count({
      where: { reportId: report.id, milestoneId: plannedMilestone.id },
    });
    expect(remaining).toBe(0);
  });
});
