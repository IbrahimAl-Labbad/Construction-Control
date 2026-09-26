import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  updateMilestone,
  startMilestone,
  completeMilestone,
  cancelMilestone,
  deleteMilestone,
  getProjectMilestones,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

describe('Milestone Status Lifecycle & Terminal Locking (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير دورة الحياة',
        email: `mgr.lifecycle.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    const p = await prisma.project.create({
      data: {
        code: `PRJ-LC-${Date.now().toString().slice(-4)}`,
        name: 'مشروع دورة حياة المعالم',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(p.id);
    testProject = { id: p.id, code: p.code, name: p.name };

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (cleanupMilestoneIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'PROJECT_MILESTONE',
          entityId: { in: cleanupMilestoneIds },
        },
      });
      await prisma.projectMilestone.deleteMany({
        where: { id: { in: cleanupMilestoneIds } },
      });
    }

    if (cleanupProjectIds.length > 0 || cleanupUserIds.length > 0) {
      if (cleanupProjectIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entityType: 'PROJECT',
            entityId: { in: cleanupProjectIds },
          },
        });
      }
      await prisma.projectMilestone.deleteMany({
        where: {
          OR: [
            ...(cleanupProjectIds.length > 0 ? [{ projectId: { in: cleanupProjectIds } }] : []),
            ...(cleanupUserIds.length > 0 ? [{ createdById: { in: cleanupUserIds } }] : []),
          ],
        },
      });
      await prisma.project.deleteMany({
        where: {
          OR: [
            ...(cleanupProjectIds.length > 0 ? [{ id: { in: cleanupProjectIds } }] : []),
            ...(cleanupUserIds.length > 0 ? [{ managerId: { in: cleanupUserIds } }] : []),
          ],
        },
      });
    }

    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }

    cleanupMilestoneIds.length = 0;
    cleanupProjectIds.length = 0;
    cleanupUserIds.length = 0;
  });

  it('progresses: PLANNED -> IN_PROGRESS -> COMPLETED and locks the milestone', async () => {
    // 1. Create in PLANNED
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة الهيكل الإنشائي',
      targetDate: '2026-11-01',
    });
    cleanupMilestoneIds.push(milestone.id);
    expect(milestone.status).toBe(MilestoneStatus.PLANNED);

    // 2. Start milestone -> IN_PROGRESS
    const started = await startMilestone(milestone.id);
    expect(started.status).toBe(MilestoneStatus.IN_PROGRESS);

    // 2.1 IN_PROGRESS cannot be soft-deleted (BD-12-05)
    await expect(deleteMilestone(milestone.id)).rejects.toThrow(AppError);

    // 3. Complete milestone -> COMPLETED
    const completed = await completeMilestone(milestone.id);
    expect(completed.status).toBe(MilestoneStatus.COMPLETED);
    expect(completed.achievedAt).not.toBeNull();

    // 3.1 COMPLETED cannot be modified (BD-12-16)
    await expect(
      updateMilestone(milestone.id, { title: 'محاولة تعديل اسم بعد الاكتمال' }),
    ).rejects.toThrow(AppError);

    // 3.2 COMPLETED cannot be soft-deleted
    await expect(deleteMilestone(milestone.id)).rejects.toThrow(AppError);

    // 3.4 Verify AuditLog entries
    const logStarted = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: milestone.id, action: 'MILESTONE_STARTED' },
    });
    expect(logStarted).not.toBeNull();
    expect(logStarted?.entityType).toBe('PROJECT_MILESTONE');
    const metaStarted = logStarted?.metadata as Record<string, unknown>;
    expect(metaStarted['projectId']).toBe(testProject.id);
    expect(metaStarted['previousStatus']).toBe('PLANNED');
    expect(metaStarted['newStatus']).toBe('IN_PROGRESS');

    const logCompleted = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: milestone.id, action: 'MILESTONE_COMPLETED' },
    });
    expect(logCompleted).not.toBeNull();
    expect(logCompleted?.entityType).toBe('PROJECT_MILESTONE');
    const metaCompleted = logCompleted?.metadata as Record<string, unknown>;
    expect(metaCompleted['projectId']).toBe(testProject.id);
    expect(metaCompleted['previousStatus']).toBe('IN_PROGRESS');
    expect(metaCompleted['newStatus']).toBe('COMPLETED');
    expect(metaCompleted['achievedAt']).toBeDefined();
  });

  it('handles cancellation and locks the milestone', async () => {
    // 1. Create milestone
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة تشطيب الواجهات',
      targetDate: '2026-12-01',
    });
    cleanupMilestoneIds.push(milestone.id);

    // 2. Cancel milestone with reason
    const cancelled = await cancelMilestone(milestone.id, {
      cancellationReason: 'تم استبعاد هذا البند من العقد الرئيسي',
    });
    expect(cancelled.status).toBe(MilestoneStatus.CANCELLED);

    // 2.1 Verify AuditLog entry for cancellation
    const logCancelled = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: milestone.id, action: 'MILESTONE_CANCELLED' },
    });
    expect(logCancelled).not.toBeNull();
    expect(logCancelled?.entityType).toBe('PROJECT_MILESTONE');
    const metaCancelled = logCancelled?.metadata as Record<string, unknown>;
    expect(metaCancelled['projectId']).toBe(testProject.id);
    expect(metaCancelled['previousStatus']).toBe('PLANNED');
    expect(metaCancelled['newStatus']).toBe('CANCELLED');
    expect(metaCancelled['reason']).toBe('تم استبعاد هذا البند من العقد الرئيسي');

    // 3. CANCELLED is terminal immutable (BD-12-16)
    await expect(
      updateMilestone(milestone.id, { title: 'محاولة تعديل' }),
    ).rejects.toThrow(AppError);

    await expect(deleteMilestone(milestone.id)).rejects.toThrow(AppError);
    await expect(startMilestone(milestone.id)).rejects.toThrow(AppError);
    await expect(completeMilestone(milestone.id)).rejects.toThrow(AppError);

    // 4. CANCELLED milestone remains visible in list
    const list = await getProjectMilestones(testProject.id);
    const item = list.find((m) => m.id === milestone.id);
    expect(item?.status).toBe(MilestoneStatus.CANCELLED);
  });

  it('allows direct PLANNED -> COMPLETED transition', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'استلام رخصة البناء النهائية',
      targetDate: '2026-10-01',
    });
    cleanupMilestoneIds.push(milestone.id);

    const completed = await completeMilestone(milestone.id);
    expect(completed.status).toBe(MilestoneStatus.COMPLETED);
    expect(completed.achievedAt).not.toBeNull();
  });
});
