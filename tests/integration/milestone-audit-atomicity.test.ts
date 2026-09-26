import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  updateMilestone,
  startMilestone,
  completeMilestone,
  cancelMilestone,
  deleteMilestone,
  reorderProjectMilestones,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Audit Atomicity (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير التدقيق الذري',
        email: `mgr.audit.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    const p = await prisma.project.create({
      data: {
        code: `PRJ-AD-${Date.now().toString().slice(-4)}`,
        name: 'مشروع تدقيق المعالم',
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

    if (cleanupProjectIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'PROJECT',
          entityId: { in: cleanupProjectIds },
        },
      });
      await prisma.projectMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: cleanupProjectIds } },
      });
    }

    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
  });

  it('records all 7 audit actions in the same transaction', async () => {
    // 1. MILESTONE_CREATED
    const m1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة أ',
      targetDate: '2026-11-01',
    });
    cleanupMilestoneIds.push(m1.id);

    const log1 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m1.id, action: 'MILESTONE_CREATED' },
    });
    expect(log1).not.toBeNull();
    expect(log1?.actorId).toBe(testManager.id);
    expect(log1?.entityType).toBe('PROJECT_MILESTONE');
    const meta1 = log1?.metadata as Record<string, unknown>;
    expect(Object.keys(meta1).sort()).toEqual(['orderIndex', 'projectId', 'targetDate', 'title']);
    expect(meta1['projectId']).toBe(testProject.id);
    expect(meta1['title']).toBe('محطة أ');
    expect(meta1['targetDate']).toBe('2026-11-01');
    expect(meta1['orderIndex']).toBe(0);

    // 2. MILESTONE_UPDATED
    await updateMilestone(m1.id, {
      title: 'محطة أ المعدلة',
      reason: 'تحديث العنوان للتوضيح',
    });
    const log2 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m1.id, action: 'MILESTONE_UPDATED' },
    });
    expect(log2).not.toBeNull();
    expect(log2?.entityType).toBe('PROJECT_MILESTONE');
    const meta2 = log2?.metadata as Record<string, unknown>;
    expect(Object.keys(meta2).sort()).toEqual(['changes', 'projectId', 'reason']);
    expect(meta2['projectId']).toBe(testProject.id);
    expect(meta2['reason']).toBe('تحديث العنوان للتوضيح');
    expect(meta2['changes']).toEqual({
      title: { previous: 'محطة أ', current: 'محطة أ المعدلة' },
    });

    // 3. MILESTONE_STARTED
    await startMilestone(m1.id);
    const log3 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m1.id, action: 'MILESTONE_STARTED' },
    });
    expect(log3).not.toBeNull();
    expect(log3?.entityType).toBe('PROJECT_MILESTONE');
    const meta3 = log3?.metadata as Record<string, unknown>;
    expect(Object.keys(meta3).sort()).toEqual(['newStatus', 'previousStatus', 'projectId']);
    expect(meta3['projectId']).toBe(testProject.id);
    expect(meta3['previousStatus']).toBe('PLANNED');
    expect(meta3['newStatus']).toBe('IN_PROGRESS');

    // 4. MILESTONE_COMPLETED
    await completeMilestone(m1.id);
    const log4 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m1.id, action: 'MILESTONE_COMPLETED' },
    });
    expect(log4).not.toBeNull();
    expect(log4?.actorId).toBe(testManager.id); // BD-12-06 completion actor authority
    expect(log4?.entityType).toBe('PROJECT_MILESTONE');
    const meta4 = log4?.metadata as Record<string, unknown>;
    expect(Object.keys(meta4).sort()).toEqual(['achievedAt', 'newStatus', 'previousStatus', 'projectId']);
    expect(meta4['projectId']).toBe(testProject.id);
    expect(meta4['previousStatus']).toBe('IN_PROGRESS');
    expect(meta4['newStatus']).toBe('COMPLETED');
    expect(typeof meta4['achievedAt']).toBe('string');

    // Create m2 for cancellation and m3 for deletion
    const m2 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة ب',
      targetDate: '2026-11-10',
    });
    cleanupMilestoneIds.push(m2.id);

    const m3 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة ج',
      targetDate: '2026-11-20',
    });
    cleanupMilestoneIds.push(m3.id);

    // 5. MILESTONE_CANCELLED
    await cancelMilestone(m2.id, { cancellationReason: 'إلغاء لعدم الحاجة' });
    const log5 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m2.id, action: 'MILESTONE_CANCELLED' },
    });
    expect(log5).not.toBeNull();
    expect(log5?.entityType).toBe('PROJECT_MILESTONE');
    const meta5 = log5?.metadata as Record<string, unknown>;
    expect(Object.keys(meta5).sort()).toEqual(['newStatus', 'previousStatus', 'projectId', 'reason']);
    expect(meta5['projectId']).toBe(testProject.id);
    expect(meta5['previousStatus']).toBe('PLANNED');
    expect(meta5['newStatus']).toBe('CANCELLED');
    expect(meta5['reason']).toBe('إلغاء لعدم الحاجة');

    // 6. MILESTONE_REORDERED
    await reorderProjectMilestones({
      projectId: testProject.id,
      milestoneIds: [m3.id, m2.id, m1.id],
    });
    const log6 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT', entityId: testProject.id, action: 'MILESTONE_REORDERED' },
    });
    expect(log6).not.toBeNull();
    expect(log6?.entityType).toBe('PROJECT');
    const meta6 = log6?.metadata as Record<string, unknown>;
    expect(Object.keys(meta6).sort()).toEqual(['reorderedMilestoneIds', 'totalCount']);
    expect(meta6['reorderedMilestoneIds']).toEqual([m3.id, m2.id, m1.id]);
    expect(meta6['totalCount']).toBe(3);

    // 7. MILESTONE_DELETED
    await deleteMilestone(m3.id);
    const log7 = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: m3.id, action: 'MILESTONE_DELETED' },
    });
    expect(log7).not.toBeNull();
    expect(log7?.entityType).toBe('PROJECT_MILESTONE');
    const meta7 = log7?.metadata as Record<string, unknown>;
    expect(Object.keys(meta7).sort()).toEqual(['orderIndex', 'projectId', 'title']);
    expect(meta7['projectId']).toBe(testProject.id);
    expect(meta7['title']).toBe('محطة ج');
    expect(typeof meta7['orderIndex']).toBe('number');
  });

  it('rolls back milestone creation if AuditLog write fails', async () => {
    // Spy on prisma.$transaction to simulate an audit failure inside the transaction
    const originalTransaction = prisma.$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, options?: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_AUDIT_WRITE_ERROR');
        });
        return callback(tx);
      }, options);
    });

    await expect(
      createMilestone({
        projectId: testProject.id,
        title: 'محطة لن تحفظ',
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Assert that milestone was NOT persisted in DB
    const persisted = await prisma.projectMilestone.findFirst({
      where: { projectId: testProject.id, title: 'محطة لن تحفظ' },
    });
    expect(persisted).toBeNull();
  });
});
