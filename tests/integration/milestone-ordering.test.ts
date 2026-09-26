import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  reorderProjectMilestones,
  getProjectMilestones,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

describe('Milestone Ordering & Reordering (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير الترتيب',
        email: `mgr.order.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    const p = await prisma.project.create({
      data: {
        code: `PRJ-ORD-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار الترتيب',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(p.id);
    testProject = { id: p.id };

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

  it('assigns orderIndex sequentially and allows atomic reordering', async () => {
    // 1. Create 3 milestones
    const m0 = await createMilestone({ projectId: testProject.id, title: 'محطة 0', targetDate: '2026-11-01' });
    cleanupMilestoneIds.push(m0.id);
    expect(m0.orderIndex).toBe(0);

    const m1 = await createMilestone({ projectId: testProject.id, title: 'محطة 1', targetDate: '2026-11-05' });
    cleanupMilestoneIds.push(m1.id);
    expect(m1.orderIndex).toBe(1);

    const m2 = await createMilestone({ projectId: testProject.id, title: 'محطة 2', targetDate: '2026-11-10' });
    cleanupMilestoneIds.push(m2.id);
    expect(m2.orderIndex).toBe(2);

    // 2. Reorder reverse: [m2, m0, m1]
    const reordered = await reorderProjectMilestones({
      projectId: testProject.id,
      milestoneIds: [m2.id, m0.id, m1.id],
    });

    expect(reordered[0]?.id).toBe(m2.id);
    expect(reordered[0]?.orderIndex).toBe(0);

    expect(reordered[1]?.id).toBe(m0.id);
    expect(reordered[1]?.orderIndex).toBe(1);

    expect(reordered[2]?.id).toBe(m1.id);
    expect(reordered[2]?.orderIndex).toBe(2);

    // 3. Verify getProjectMilestones returns this exact order
    const list = await getProjectMilestones(testProject.id);
    expect(list.map((m) => m.id)).toEqual([m2.id, m0.id, m1.id]);

    // 4. Verify MILESTONE_REORDERED audit log
    const logReorder = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT', entityId: testProject.id, action: 'MILESTONE_REORDERED' },
    });
    expect(logReorder).not.toBeNull();
    expect(logReorder?.entityType).toBe('PROJECT');
    const metaReorder = logReorder?.metadata as Record<string, unknown>;
    expect(Object.keys(metaReorder).sort()).toEqual(['reorderedMilestoneIds', 'totalCount']);
    expect(metaReorder['reorderedMilestoneIds']).toEqual([m2.id, m0.id, m1.id]);
    expect(metaReorder['totalCount']).toBe(3);
  });

  it('rejects reordering when IDs are incomplete or contain foreign ID', async () => {
    const m0 = await createMilestone({ projectId: testProject.id, title: 'محطة أ', targetDate: '2026-11-01' });
    const m1 = await createMilestone({ projectId: testProject.id, title: 'محطة ب', targetDate: '2026-11-05' });
    cleanupMilestoneIds.push(m0.id, m1.id);

    // Incomplete array (only 1 of 2)
    await expect(
      reorderProjectMilestones({
        projectId: testProject.id,
        milestoneIds: [m0.id],
      }),
    ).rejects.toThrow(AppError);

    // Foreign ID
    await expect(
      reorderProjectMilestones({
        projectId: testProject.id,
        milestoneIds: [m0.id, 'cjld2cjxh0099qzrmn831i7rn'],
      }),
    ).rejects.toThrow(AppError);
  });
});
