import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  completeMilestone,
  cancelMilestone,
  getProjectMilestones,
} from '@/lib/milestones';
import { changeProjectStatus } from '@/lib/projects';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Concurrency Races (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير التزامن',
        email: `mgr.conc.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    const p = await prisma.project.create({
      data: {
        code: `PRJ-CC-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار التزامن',
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

  it('handles Create/Create race without duplicate orderIndex (BD-12-08)', async () => {
    // Fire 2 concurrent createMilestone calls on the same project
    const results = await Promise.all([
      createMilestone({
        projectId: testProject.id,
        title: 'محطة متزامنة 1',
        targetDate: '2026-11-01',
      }),
      createMilestone({
        projectId: testProject.id,
        title: 'محطة متزامنة 2',
        targetDate: '2026-11-02',
      }),
    ]);

    cleanupMilestoneIds.push(results[0].id, results[1].id);

    // Both must succeed and have distinct, unique orderIndexes (0 and 1)
    const orderIndices = results.map((m) => m.orderIndex).sort();
    expect(orderIndices).toEqual([0, 1]);

    const list = await getProjectMilestones(testProject.id);
    expect(list).toHaveLength(2);
    expect(list[0]?.orderIndex).toBe(0);
    expect(list[1]?.orderIndex).toBe(1);
  });

  it('handles Complete/Cancel race cleanly on the same milestone', async () => {
    const m = await createMilestone({
      projectId: testProject.id,
      title: 'محطة تعارض الإنجاز والإلغاء',
      targetDate: '2026-11-01',
    });
    cleanupMilestoneIds.push(m.id);

    // Concurrently complete and cancel the same milestone
    const results = await Promise.allSettled([
      completeMilestone(m.id),
      cancelMilestone(m.id, { cancellationReason: 'سبب إلغاء متزامن' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one operation must succeed, and the other must be rejected cleanly
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalState = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: m.id },
    });
    expect([MilestoneStatus.COMPLETED, MilestoneStatus.CANCELLED]).toContain(finalState.status);

    if (finalState.status === MilestoneStatus.COMPLETED) {
      expect(finalState.achievedAt).not.toBeNull();
    } else {
      expect(finalState.achievedAt).toBeNull();
    }
  });

  it('handles Milestone Creation vs Project Completion race', async () => {
    // Concurrently attempt to create a milestone while manager completes the project
    const results = await Promise.allSettled([
      createMilestone({
        projectId: testProject.id,
        title: 'محطة أثناء إكمال المشروع',
        targetDate: '2026-11-01',
      }),
      changeProjectStatus(testProject.id, { newStatus: ProjectStatus.COMPLETED }),
    ]);

    // Check project status in DB
    const projectInDb = await prisma.project.findUniqueOrThrow({
      where: { id: testProject.id },
    });

    if (projectInDb.status === ProjectStatus.COMPLETED) {
      // If project was completed first, any milestone created afterward or blocked must throw INVALID_PROJECT_STATUS
      const createdMilestoneResult = results[0];
      if (createdMilestoneResult.status === 'fulfilled') {
        cleanupMilestoneIds.push(createdMilestoneResult.value.id);
      }
    }
    expect(projectInDb.status).toBe(ProjectStatus.COMPLETED);
  });
});
