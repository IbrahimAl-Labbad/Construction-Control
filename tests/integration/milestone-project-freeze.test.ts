import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createMilestone } from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

describe('Project Lifecycle Milestone Freeze (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let plannedProject: { id: string };
  let activeProject: { id: string };
  let onHoldProject: { id: string };
  let completedProject: { id: string };
  let cancelledProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير تجميد المشاريع',
        email: `mgr.freeze.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    const pPlanned = await prisma.project.create({
      data: { code: `PRJ-FZ-PL-${Date.now().toString().slice(-4)}`, name: 'مشروع مخطط', status: ProjectStatus.PLANNED, managerId: mgr.id },
    });
    plannedProject = { id: pPlanned.id };
    cleanupProjectIds.push(pPlanned.id);

    const pActive = await prisma.project.create({
      data: { code: `PRJ-FZ-AC-${Date.now().toString().slice(-4)}`, name: 'مشروع نشط', status: ProjectStatus.ACTIVE, managerId: mgr.id },
    });
    activeProject = { id: pActive.id };
    cleanupProjectIds.push(pActive.id);

    const pOnHold = await prisma.project.create({
      data: { code: `PRJ-FZ-OH-${Date.now().toString().slice(-4)}`, name: 'مشروع معلق', status: ProjectStatus.ON_HOLD, managerId: mgr.id },
    });
    onHoldProject = { id: pOnHold.id };
    cleanupProjectIds.push(pOnHold.id);

    const pCompleted = await prisma.project.create({
      data: { code: `PRJ-FZ-CO-${Date.now().toString().slice(-4)}`, name: 'مشروع مكتمل', status: ProjectStatus.COMPLETED, managerId: mgr.id },
    });
    completedProject = { id: pCompleted.id };
    cleanupProjectIds.push(pCompleted.id);

    const pCancelled = await prisma.project.create({
      data: { code: `PRJ-FZ-CA-${Date.now().toString().slice(-4)}`, name: 'مشروع ملغى', status: ProjectStatus.CANCELLED, managerId: mgr.id },
    });
    cancelledProject = { id: pCancelled.id };
    cleanupProjectIds.push(pCancelled.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (cleanupMilestoneIds.length > 0) {
      await prisma.projectMilestone.deleteMany({
        where: { id: { in: cleanupMilestoneIds } },
      });
    }

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

  it('allows mutations when project status is PLANNED or ACTIVE (BD-12-09)', async () => {
    const mPlanned = await createMilestone({
      projectId: plannedProject.id,
      title: 'محطة مشروع مخطط',
      targetDate: '2026-11-01',
    });
    cleanupMilestoneIds.push(mPlanned.id);
    expect(mPlanned.id).toBeDefined();

    const mActive = await createMilestone({
      projectId: activeProject.id,
      title: 'محطة مشروع نشط',
      targetDate: '2026-11-01',
    });
    cleanupMilestoneIds.push(mActive.id);
    expect(mActive.id).toBeDefined();
  });

  it('freezes all mutations when project is ON_HOLD, COMPLETED, or CANCELLED', async () => {
    // 1. Create on ON_HOLD
    await expect(
      createMilestone({
        projectId: onHoldProject.id,
        title: 'محاولة في معلق',
        targetDate: '2026-11-01',
      }),
    ).rejects.toThrow(AppError);

    // 2. Create on COMPLETED
    await expect(
      createMilestone({
        projectId: completedProject.id,
        title: 'محاولة في مكتمل',
        targetDate: '2026-11-01',
      }),
    ).rejects.toThrow(AppError);

    // 3. Create on CANCELLED
    await expect(
      createMilestone({
        projectId: cancelledProject.id,
        title: 'محاولة في ملغى',
        targetDate: '2026-11-01',
      }),
    ).rejects.toThrow(AppError);
  });
});
