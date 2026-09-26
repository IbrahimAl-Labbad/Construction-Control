import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getProjectMilestones,
  getProjectMilestone,
  getProjectMilestoneSummary,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

describe('Milestone CRUD Lifecycle & IDOR (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };
  let testProject2: { id: string; code: string; name: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupMilestoneIds: string[] = [];

  beforeEach(async () => {
    // 1. Create test Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير اختبار المعالم',
        email: `mgr.milestone.${Date.now()}.${Math.random()}@test.local`,
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

    // 2. Create Project 1 (ACTIVE)
    const p1 = await prisma.project.create({
      data: {
        code: `PRJ-M1-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار المعالم 1',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(p1.id);
    testProject = { id: p1.id, code: p1.code, name: p1.name };

    // 3. Create Project 2 (ACTIVE)
    const p2 = await prisma.project.create({
      data: {
        code: `PRJ-M2-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار المعالم 2',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(p2.id);
    testProject2 = { id: p2.id, code: p2.code, name: p2.name };

    // Default mock: manager authenticated
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

  it('creates, updates, and soft-deletes a planned milestone', async () => {
    // 1. Create milestone
    const created = await createMilestone({
      projectId: testProject.id,
      title: 'محطة أعمال الحفر',
      description: 'تسوية الموقع وبدء الحفر',
      targetDate: '2026-11-15',
    });
    cleanupMilestoneIds.push(created.id);

    expect(created.id).toBeDefined();
    expect(created.projectId).toBe(testProject.id);
    expect(created.title).toBe('محطة أعمال الحفر');
    expect(created.description).toBe('تسوية الموقع وبدء الحفر');
    expect(created.targetDate).toBe('2026-11-15');
    expect(created.status).toBe(MilestoneStatus.PLANNED);
    expect(created.orderIndex).toBe(0);
    expect(created.achievedAt).toBeNull();
    expect(created.creatorName).toBe(testManager.name);

    // 2. Query list
    const listAfterCreate = await getProjectMilestones(testProject.id);
    expect(listAfterCreate).toHaveLength(1);
    expect(listAfterCreate[0]?.id).toBe(created.id);

    // 3. Query summary
    const summary = await getProjectMilestoneSummary(testProject.id);
    expect(summary.totalCount).toBe(1);
    expect(summary.plannedCount).toBe(1);
    expect(summary.completedCount).toBe(0);
    expect(summary.nextUpcomingMilestone?.id).toBe(created.id);

    // 4. Update metadata
    const updated = await updateMilestone(created.id, {
      title: 'محطة الحفر والردم',
      description: 'وصف محدث',
      targetDate: '2026-11-20',
    });

    expect(updated.title).toBe('محطة الحفر والردم');
    expect(updated.description).toBe('وصف محدث');
    expect(updated.targetDate).toBe('2026-11-20');
    expect(updated.updaterName).toBe(testManager.name);

    // 5. Soft delete (BD-12-05: allowed for PLANNED)
    const deleteRes = await deleteMilestone(created.id);
    expect(deleteRes.success).toBe(true);

    // 6. Verify excluded from active queries
    const listAfterDelete = await getProjectMilestones(testProject.id);
    expect(listAfterDelete).toHaveLength(0);

    const summaryAfterDelete = await getProjectMilestoneSummary(testProject.id);
    expect(summaryAfterDelete.totalCount).toBe(0);
    expect(summaryAfterDelete.nextUpcomingMilestone).toBeNull();

    // 7. Verify AuditLog entries (entityType and metadata)
    const logCreate = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: created.id, action: 'MILESTONE_CREATED' },
    });
    expect(logCreate).not.toBeNull();
    expect(logCreate?.entityType).toBe('PROJECT_MILESTONE');
    const metaCreate = logCreate?.metadata as Record<string, unknown>;
    expect(metaCreate['projectId']).toBe(testProject.id);
    expect(metaCreate['title']).toBe('محطة أعمال الحفر');
    expect(metaCreate['targetDate']).toBe('2026-11-15');
    expect(metaCreate['orderIndex']).toBe(0);

    const logUpdate = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: created.id, action: 'MILESTONE_UPDATED' },
    });
    expect(logUpdate).not.toBeNull();
    expect(logUpdate?.entityType).toBe('PROJECT_MILESTONE');
    const metaUpdate = logUpdate?.metadata as Record<string, unknown>;
    expect(metaUpdate['projectId']).toBe(testProject.id);
    expect(metaUpdate['changes']).toBeDefined();

    const logDelete = await prisma.auditLog.findFirst({
      where: { entityType: 'PROJECT_MILESTONE', entityId: created.id, action: 'MILESTONE_DELETED' },
    });
    expect(logDelete).not.toBeNull();
    expect(logDelete?.entityType).toBe('PROJECT_MILESTONE');
    const metaDelete = logDelete?.metadata as Record<string, unknown>;
    expect(metaDelete['projectId']).toBe(testProject.id);
    expect(metaDelete['title']).toBe('محطة الحفر والردم');
    expect(metaDelete['orderIndex']).toBe(0);

    // 8. Direct fetch throws NOT_FOUND
    await expect(getProjectMilestone(testProject.id, created.id)).rejects.toThrow(AppError);
  });

  it('enforces IDOR protection: cannot access milestone of project A using project B id', async () => {
    const milestoneInProject1 = await createMilestone({
      projectId: testProject.id,
      title: 'محطة في مشروع 1',
      targetDate: '2026-12-01',
    });
    cleanupMilestoneIds.push(milestoneInProject1.id);

    // Fetching milestone using wrong projectId (testProject2.id) must throw NOT_FOUND
    await expect(
      getProjectMilestone(testProject2.id, milestoneInProject1.id),
    ).rejects.toThrow(AppError);
  });

  it('enforces mandatory query correction: milestones of a soft-deleted project are NOT returned', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة لمشروع سيتم حذفه',
      targetDate: '2026-12-15',
    });
    cleanupMilestoneIds.push(milestone.id);

    // Soft-delete the project
    await prisma.project.update({
      where: { id: testProject.id },
      data: { deletedAt: new Date() },
    });

    // Queries must return NOT_FOUND for soft-deleted project
    await expect(getProjectMilestones(testProject.id)).rejects.toThrow(AppError);
    await expect(getProjectMilestone(testProject.id, milestone.id)).rejects.toThrow(AppError);
    await expect(getProjectMilestoneSummary(testProject.id)).rejects.toThrow(AppError);
  });
});
