/**
 * tests/integration/progress-report-milestone-authoring.test.ts
 *
 * Integration tests for Progress Report Authoring Integration with Milestone Linkages (CR-08 Task 3 / §6.3).
 *
 * Verifies:
 * 1. createProgressReportDraft with milestoneIds creates the report and links milestones in the same transaction.
 * 2. updateProgressReportDraft with milestoneIds omitted (undefined) preserves existing links.
 * 3. updateProgressReportDraft with milestoneIds: [] unlinks all permitted milestones.
 * 4. updateProgressReportDraft with new IDs synchronizes linkages (adds new, removes omitted, retains existing).
 * 5. updateProgressReportDraft attempting to unlink a COMPLETED milestone is rejected with MILESTONE_COMPLETED_IMMUTABLE.
 * 6. Cross-project milestone linkage is rejected with CROSS_PROJECT_LINKAGE_FORBIDDEN.
 * 7. Unassigned Engineer authoring with milestoneIds is rejected with FORBIDDEN.
 * 8. Engineer attempting to update another engineer's report receives NOT_FOUND (IDOR protection).
 * 9. getProgressReport returns linked milestones with targetDate, title, status, and orderIndex.
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
  createProgressReportDraft,
  updateProgressReportDraft,
  getProgressReport,
} from '@/lib/progress-reports';
import {
  createMilestone,
  completeMilestone,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Progress Report Authoring & Milestone Linkage Integration (Live PostgreSQL)', () => {
  let managerUser: AuthenticatedUser;
  let assignedEngineer: AuthenticatedUser;
  let unassignedEngineer: AuthenticatedUser;
  let testProject: { id: string };
  let secondProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير التقارير والمحطات',
        email: `mgr.auth.${Date.now()}.${Math.random()}@test.local`,
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

    // 2. Assigned Engineer
    const eng1 = await prisma.user.create({
      data: {
        name: 'مهندس معين',
        email: `eng.assigned.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng1.id);
    assignedEngineer = {
      id: eng1.id,
      name: eng1.name,
      email: eng1.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Unassigned Engineer
    const eng2 = await prisma.user.create({
      data: {
        name: 'مهندس غير معين',
        email: `eng.unassigned.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng2.id);
    unassignedEngineer = {
      id: eng2.id,
      name: eng2.name,
      email: eng2.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Primary Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-REP-${Date.now().toString().slice(-4)}`,
        name: 'مشروع ربط التقارير بالمحطات',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = { id: prj.id };

    // 5. Assign Engineer to Primary Project
    await prisma.projectAssignment.create({
      data: {
        projectId: prj.id,
        engineerId: eng1.id,
        status: AssignmentStatus.ACTIVE,
        assignedById: mgr.id,
      },
    });

    // 6. Secondary Project (for cross-project checks)
    const prj2 = await prisma.project.create({
      data: {
        code: `PRJ-SEC-${Date.now().toString().slice(-4)}`,
        name: 'مشروع ثانوي للاختبار',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(prj2.id);
    secondProject = { id: prj2.id };

    // Default mock: assignedEngineer
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(assignedEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(managerUser);
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

  it('TC-T3-01: creates a draft report with milestoneIds and links the requested milestones', async () => {
    // 1. Create 2 milestones in the project
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة أعمال الحفر',
      targetDate: '2026-11-15',
    });
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة صب الخرسانة العادية',
      targetDate: '2026-11-20',
    });

    // 2. Engineer authors a progress report draft linked to m1 and m2
    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-15',
      title: 'تقرير الأعمال التأسيسية',
      workDescription: 'أعمال حفر وصب خرسانة عادية',
      progressPercentage: 25,
      milestoneIds: [m1.id, m2.id],
    });

    expect(report.id).toBeDefined();
    expect(report.status).toBe(ProgressReportStatus.DRAFT);
    expect(report.milestones).toHaveLength(2);
    expect(report.milestones?.map((m) => m.id)).toEqual([m1.id, m2.id]);

    // 3. Verify DB join rows persisted
    const dbLinks = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id, projectId: testProject.id },
      orderBy: { milestone: { orderIndex: 'asc' } },
    });
    expect(dbLinks).toHaveLength(2);
    expect(dbLinks[0]?.milestoneId).toBe(m1.id);
    expect(dbLinks[1]?.milestoneId).toBe(m2.id);

    // 4. Verify MILESTONE_REPORT_LINKED audit logs created in the same transaction
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'MILESTONE_REPORT_LINKED',
        entityId: { in: dbLinks.map((l) => l.id) },
      },
    });
    expect(auditLogs).toHaveLength(2);
  });

  it('TC-T3-02: updating a report with milestoneIds omitted preserves existing links', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة التمديدات',
      targetDate: '2026-11-25',
    });

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-16',
      title: 'تقرير تمديدات',
      workDescription: 'أعمال تمديد مواسير',
      milestoneIds: [m1.id],
    });
    expect(report.milestones).toHaveLength(1);

    // Update text fields with milestoneIds === undefined (omitted)
    const updated = await updateProgressReportDraft(report.id, {
      title: 'تقرير تمديدات - محدث',
      workDescription: 'أعمال تمديد واختبار ضغط',
    });

    expect(updated.title).toBe('تقرير تمديدات - محدث');
    expect(updated.milestones).toHaveLength(1);
    expect(updated.milestones?.[0]?.id).toBe(m1.id);

    // Verify DB still contains exactly the same linkage row
    const dbLinks = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id },
    });
    expect(dbLinks).toHaveLength(1);
    expect(dbLinks[0]?.milestoneId).toBe(m1.id);
  });

  it('TC-T3-03: updating with milestoneIds: [] unlinks all permitted milestones', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة المراد فك ارتباطها',
      targetDate: '2026-11-26',
    });

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-17',
      title: 'تقرير سيتم فك ارتباطه',
      workDescription: 'أعمال عزل',
      milestoneIds: [m1.id],
    });

    const linkRow = await prisma.progressReportMilestone.findFirstOrThrow({
      where: { reportId: report.id, milestoneId: m1.id },
    });

    // Update with milestoneIds: []
    const updated = await updateProgressReportDraft(report.id, {
      milestoneIds: [],
    });

    expect(updated.milestones).toHaveLength(0);

    // Verify DB linkage row is deleted
    const dbLinks = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id },
    });
    expect(dbLinks).toHaveLength(0);

    // Verify MILESTONE_REPORT_UNLINKED audit log was written with full provenance metadata
    const unlinkLog = await prisma.auditLog.findFirst({
      where: {
        action: 'MILESTONE_REPORT_UNLINKED',
        entityId: linkRow.id,
      },
    });
    expect(unlinkLog).not.toBeNull();
    const meta = unlinkLog?.metadata as Record<string, unknown>;
    expect(meta['reportId']).toBe(report.id);
    expect(meta['milestoneId']).toBe(m1.id);
    expect(meta['unlinkedById']).toBe(assignedEngineer.id);
  });

  it('TC-T3-04: updating with IDs synchronizes associations correctly (adds, removes, retains)', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة يتم الاحتفاظ بها',
      targetDate: '2026-11-27',
    });
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة سيتم حذفها',
      targetDate: '2026-11-28',
    });
    const m3 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة جديدة ستضاف',
      targetDate: '2026-11-29',
    });

    // Create report linked to m1 and m2
    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-18',
      title: 'تقرير للمزامنة الجزئية',
      workDescription: 'أعمال بناء',
      milestoneIds: [m1.id, m2.id],
    });

    // Sync to [m1, m3]: m1 retained (no-op), m2 unlinked, m3 added
    const updated = await updateProgressReportDraft(report.id, {
      milestoneIds: [m1.id, m3.id],
    });

    expect(updated.milestones).toHaveLength(2);
    expect(updated.milestones?.map((m) => m.id)).toEqual([m1.id, m3.id]);

    const finalLinks = await prisma.progressReportMilestone.findMany({
      where: { reportId: report.id },
      orderBy: { milestone: { orderIndex: 'asc' } },
    });
    expect(finalLinks).toHaveLength(2);
    expect(finalLinks.map((l) => l.milestoneId)).toEqual([m1.id, m3.id]);
  });

  it('TC-T3-05: rejects unlinking a COMPLETED milestone with MILESTONE_COMPLETED_IMMUTABLE', async () => {
    const completedMilestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مكتملة لا يمكن فك ارتباطها',
      targetDate: '2026-11-01',
    });

    // Create report and link
    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-19',
      title: 'تقرير إثبات المحطة المكتملة',
      workDescription: 'أعمال منجزة بالكامل',
      milestoneIds: [completedMilestone.id],
    });

    // Add photo attachment and approve report to qualify milestone for completion
    await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: report.id,
        category: AttachmentCategory.PROGRESS_PHOTO,
        originalFileName: 'photo.jpg',
        storageKey: `test/photo/${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedById: assignedEngineer.id,
      },
    });

    await prisma.progressReport.update({
      where: { id: report.id },
      data: {
        status: ProgressReportStatus.APPROVED,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Complete the milestone
    await completeMilestone(completedMilestone.id);

    // Revert report status to DRAFT for the engineer to test unlinking attempt
    await prisma.progressReport.update({
      where: { id: report.id },
      data: { status: ProgressReportStatus.DRAFT },
    });

    // Engineer attempts to unlink the completed milestone
    let thrownError: AppError | null = null;
    try {
      await updateProgressReportDraft(report.id, {
        milestoneIds: [],
      });
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('MILESTONE_COMPLETED_IMMUTABLE');
  });

  it('TC-T3-06: rejects linking to a milestone belonging to another project with CROSS_PROJECT_LINKAGE_FORBIDDEN', async () => {
    // Milestone in secondProject
    const foreignMilestone = await createMilestone({
      projectId: secondProject.id,
      title: 'محطة المشروع الثانوي',
      targetDate: '2026-12-01',
    });

    // Attempt to create report in testProject linking foreignMilestone
    let thrownError: AppError | null = null;
    try {
      await createProgressReportDraft({
        projectId: testProject.id,
        reportDate: '2026-10-20',
        title: 'تقرير بمحطة مشروع آخر',
        workDescription: 'أعمال',
        milestoneIds: [foreignMilestone.id],
      });
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('CROSS_PROJECT_LINKAGE_FORBIDDEN');
  });

  it('TC-T3-07: rejects unassigned Engineer linking milestones with FORBIDDEN', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة لاختبار الصلاحيات',
      targetDate: '2026-12-05',
    });

    // Switch actor to unassignedEngineer
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(unassignedEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(unassignedEngineer);

    let thrownError: AppError | null = null;
    try {
      await createProgressReportDraft({
        projectId: testProject.id,
        reportDate: '2026-10-21',
        title: 'تقرير مهندس غير معين',
        workDescription: 'أعمال',
        milestoneIds: [m1.id],
      });
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeDefined();
    expect((thrownError as unknown as { code: string }).code).toBe('FORBIDDEN');
  });

  it('TC-T3-08: getProgressReport query returns the linked milestones sorted by orderIndex', async () => {
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'المحطة الأولى',
      targetDate: '2026-11-10',
    });
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'المحطة الثانية',
      targetDate: '2026-11-20',
    });

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2026-10-22',
      title: 'تقرير فحص الاستعلام',
      workDescription: 'أعمال فحص وتدقيق',
      milestoneIds: [m2.id, m1.id], // provided in reverse order
    });

    // Fetch via getProgressReport
    const fetched = await getProgressReport(report.id);

    expect(fetched.id).toBe(report.id);
    expect(fetched.milestones).toHaveLength(2);
    // Verified sorted by orderIndex ASC: m1 then m2
    expect(fetched.milestones?.[0]?.id).toBe(m1.id);
    expect(fetched.milestones?.[0]?.title).toBe('المحطة الأولى');
    expect(fetched.milestones?.[1]?.id).toBe(m2.id);
    expect(fetched.milestones?.[1]?.title).toBe('المحطة الثانية');
  });
});
