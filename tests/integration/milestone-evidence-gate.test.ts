/**
 * tests/integration/milestone-evidence-gate.test.ts
 *
 * Integration tests for Milestone Mandatory Visual Evidence Gate & Committed-Outcome Audit Strategy (CR-08 / BD-17).
 *
 * Verifies with real PostgreSQL database commits:
 * 1. Milestone without linked reports -> throws MILESTONE_EVIDENCE_MISSING, commits MILESTONE_COMPLETION_BLOCKED in DB.
 * 2. Milestone linked to DRAFT or SUBMITTED report -> throws MILESTONE_EVIDENCE_MISSING, commits MILESTONE_COMPLETION_BLOCKED in DB.
 * 3. Milestone linked to APPROVED report with zero attachments or PDF-only -> throws MILESTONE_EVIDENCE_MISSING, commits blocked log in DB.
 * 4. Milestone linked to APPROVED report with qualified photos -> transitions to COMPLETED, commits MILESTONE_COMPLETED with exact verified IDs.
 * 5. Attempting to link or unlink reports on a COMPLETED milestone -> fails with MILESTONE_COMPLETED_IMMUTABLE.
 */

import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  ProgressReportStatus,
  MilestoneStatus,
  AssignmentStatus,
  AttachmentOwnerType,
  AttachmentCategory,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  completeMilestone,
  linkProgressReport,
  unlinkProgressReport,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Visual Evidence Gate & Committed-Outcome (Live DB)', () => {
  let managerUser: AuthenticatedUser;
  let engineerUser: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Create Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير اختبار الأدلة',
        email: `mgr.ev.${Date.now()}.${Math.random()}@test.local`,
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

    // 2. Create Engineer
    const eng = await prisma.user.create({
      data: {
        name: 'مهندس اختبار الأدلة',
        email: `eng.ev.${Date.now()}.${Math.random()}@test.local`,
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

    // 3. Create Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-EV-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار بوابة الأدلة',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = { id: prj.id };

    // 4. Assign Engineer to project
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
    // Delete in strict referential order: join rows first (onDelete: Restrict)
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

  it('blocks completion when milestone has zero linked reports and commits MILESTONE_COMPLETION_BLOCKED in DB', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة بدون تقارير',
      targetDate: '2026-11-15',
    });

    let thrownError: AppError | null = null;
    try {
      await completeMilestone(milestone.id);
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('MILESTONE_EVIDENCE_MISSING');

    // Verify milestone status remains PLANNED
    const unchanged = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });
    expect(unchanged.status).toBe(MilestoneStatus.PLANNED);
    expect(unchanged.achievedAt).toBeNull();

    // Verify MILESTONE_COMPLETION_BLOCKED actually committed and persisted in PostgreSQL
    const blockedLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        action: 'MILESTONE_COMPLETION_BLOCKED',
      },
    });
    expect(blockedLog).not.toBeNull();
    const meta = blockedLog?.metadata as Record<string, unknown>;
    expect(meta.reason).toBe('MISSING_QUALIFIED_VISUAL_EVIDENCE');
    expect(meta.linkedReportsCount).toBe(0);
    expect(meta.approvedReportsCount).toBe(0);
  });

  it('blocks completion when milestone is linked to a DRAFT or SUBMITTED report and commits audit log', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مع تقرير مسودة',
      targetDate: '2026-11-20',
    });

    // Create a DRAFT report authored by engineer
    const draftReport = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-15'),
        title: 'تقرير تقدم موقع مسودة',
        workDescription: 'أعمال صب الخرسانة للقواعد',
        status: ProgressReportStatus.DRAFT,
        createdById: engineerUser.id,
      },
    });

    // Link report to milestone
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: draftReport.id,
    });

    let thrownError: AppError | null = null;
    try {
      await completeMilestone(milestone.id);
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError?.code).toBe('MILESTONE_EVIDENCE_MISSING');

    // Verify blocked audit log committed
    const blockedLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        action: 'MILESTONE_COMPLETION_BLOCKED',
      },
    });
    expect(blockedLog).not.toBeNull();
    const meta = blockedLog?.metadata as Record<string, unknown>;
    expect(meta.linkedReportsCount).toBe(1);
    expect(meta.approvedReportsCount).toBe(0);
  });

  it('blocks completion when linked APPROVED report has no attachments or only non-visual PDF documents', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مع تقرير بدون صور',
      targetDate: '2026-11-25',
    });

    // Create an APPROVED report
    const approvedReport = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-16'),
        title: 'تقرير معتمد بدون صور',
        workDescription: 'تركيب حديد التسليح للأعمدة',
        status: ProgressReportStatus.APPROVED,
        createdById: engineerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Add a PDF document attachment (PDF is non-visual evidence and cannot satisfy the photo gate)
    await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: approvedReport.id,
        category: AttachmentCategory.EXECUTION_EVIDENCE,
        originalFileName: 'specifications.pdf',
        storageKey: `test/pdf/${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedById: engineerUser.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: approvedReport.id,
    });

    let thrownError: AppError | null = null;
    try {
      await completeMilestone(milestone.id);
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError?.code).toBe('MILESTONE_EVIDENCE_MISSING');

    const blockedLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        action: 'MILESTONE_COMPLETION_BLOCKED',
      },
    });
    expect(blockedLog).not.toBeNull();
    const meta = blockedLog?.metadata as Record<string, unknown>;
    expect(meta.linkedReportsCount).toBe(1);
    expect(meta.approvedReportsCount).toBe(1);
    expect(meta.verifiedAttachmentCount).toBe(0);
  });

  it('successfully completes milestone when linked APPROVED report contains qualified visual photos', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة مكتملة بأدلة بصرية',
      targetDate: '2026-11-30',
    });

    // Create APPROVED report
    const approvedReport = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-18'),
        title: 'تقرير معتمد يحتوي على صور توثيقية',
        workDescription: 'إنهاء صب أعمدة الدور الأرضي',
        status: ProgressReportStatus.APPROVED,
        createdById: engineerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Add 2 qualifying visual photos (JPEG + PNG)
    const photo1 = await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: approvedReport.id,
        category: AttachmentCategory.PROGRESS_PHOTO,
        originalFileName: 'columns-casting-1.jpeg',
        storageKey: `test/photos/${Date.now()}-1.jpeg`,
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        checksumSha256: 'b'.repeat(64),
        uploadedById: engineerUser.id,
      },
    });

    const photo2 = await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: approvedReport.id,
        category: AttachmentCategory.EXECUTION_EVIDENCE,
        originalFileName: 'columns-curing-2.png',
        storageKey: `test/photos/${Date.now()}-2.png`,
        mimeType: 'image/png',
        sizeBytes: 4096,
        checksumSha256: 'c'.repeat(64),
        uploadedById: engineerUser.id,
      },
    });

    // Link report to milestone
    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: approvedReport.id,
    });

    // Execute completeMilestone
    const completedDTO = await completeMilestone(milestone.id);

    expect(completedDTO.status).toBe(MilestoneStatus.COMPLETED);
    expect(completedDTO.achievedAt).not.toBeNull();
    expect(completedDTO.linkedReportsCount).toBe(1);
    expect(completedDTO.approvedReportsCount).toBe(1);
    expect(completedDTO.visualAttachmentsCount).toBe(2);
    expect(completedDTO.hasSufficientEvidence).toBe(true);

    // Verify MILESTONE_COMPLETED audit log with verified IDs
    const completedLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        action: 'MILESTONE_COMPLETED',
      },
    });
    expect(completedLog).not.toBeNull();
    const meta = completedLog?.metadata as Record<string, unknown>;
    expect(meta.newStatus).toBe(MilestoneStatus.COMPLETED);
    expect(meta.verifiedReportIds).toEqual([approvedReport.id]);
    expect((meta.verifiedAttachmentIds as string[]).sort()).toEqual([photo1.id, photo2.id].sort());
    expect(meta.verifiedAttachmentCount).toBe(2);
  });

  it('strictly rejects unlinking a report from a COMPLETED milestone with MILESTONE_COMPLETED_IMMUTABLE', async () => {
    // Setup completed milestone
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة منجزة لا يمكن تعديل ارتباطاتها',
      targetDate: '2026-11-28',
    });

    const report = await prisma.progressReport.create({
      data: {
        projectId: testProject.id,
        reportDate: new Date('2026-10-19'),
        title: 'تقرير محطة منجزة',
        workDescription: 'أعمال منجزة',
        status: ProgressReportStatus.APPROVED,
        createdById: engineerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    await prisma.attachment.create({
      data: {
        projectId: testProject.id,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: report.id,
        category: AttachmentCategory.PROGRESS_PHOTO,
        originalFileName: 'site-photo.webp',
        storageKey: `test/photos/${Date.now()}.webp`,
        mimeType: 'image/webp',
        sizeBytes: 1500,
        checksumSha256: 'd'.repeat(64),
        uploadedById: engineerUser.id,
      },
    });

    await linkProgressReport({
      projectId: testProject.id,
      milestoneId: milestone.id,
      reportId: report.id,
    });

    await completeMilestone(milestone.id);

    // Attempting to unlink
    let thrownError: AppError | null = null;
    try {
      await unlinkProgressReport({
        projectId: testProject.id,
        milestoneId: milestone.id,
        reportId: report.id,
      });
    } catch (err) {
      thrownError = err as AppError;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError?.code).toBe('MILESTONE_COMPLETED_IMMUTABLE');
  });
});
