import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { Role, ProjectStatus, AssignmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createMilestone,
  updateMilestone,
  completeMilestone,
  deleteMilestone,
  getProjectMilestones,
  getProjectMilestone,
  getProjectMilestoneSummary,
} from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { PermissionError } from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Authorization Matrix (Live PostgreSQL Integration)', () => {
  let managerUser: AuthenticatedUser;
  let assignedEngineer: AuthenticatedUser;
  let unassignedEngineer: AuthenticatedUser;
  let accountantUser: AuthenticatedUser;
  let purchasingUser: AuthenticatedUser;

  let testProject: { id: string; code: string; name: string };
  let testMilestoneId: string;

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير الصلاحيات',
        email: `mgr.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    managerUser = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    // 2. Assigned Engineer
    const eng1 = await prisma.user.create({
      data: {
        name: 'مهندس معين',
        email: `eng1.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng1.id);
    assignedEngineer = { id: eng1.id, name: eng1.name, email: eng1.email, role: Role.ENGINEER, isActive: true };

    // 3. Unassigned Engineer
    const eng2 = await prisma.user.create({
      data: {
        name: 'مهندس غير معين',
        email: `eng2.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng2.id);
    unassignedEngineer = { id: eng2.id, name: eng2.name, email: eng2.email, role: Role.ENGINEER, isActive: true };

    // 4. Accountant
    const acc = await prisma.user.create({
      data: {
        name: 'محاسب المشروع',
        email: `acc.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ACCOUNTANT,
        isActive: true,
      },
    });
    cleanupUserIds.push(acc.id);
    accountantUser = { id: acc.id, name: acc.name, email: acc.email, role: Role.ACCOUNTANT, isActive: true };

    // 5. Purchasing
    const pur = await prisma.user.create({
      data: {
        name: 'مسؤول المشتريات',
        email: `pur.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.PURCHASING,
        isActive: true,
      },
    });
    cleanupUserIds.push(pur.id);
    purchasingUser = { id: pur.id, name: pur.name, email: pur.email, role: Role.PURCHASING, isActive: true };

    // 6. Project
    const p = await prisma.project.create({
      data: {
        code: `PRJ-AU-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار الصلاحيات',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(p.id);
    testProject = { id: p.id, code: p.code, name: p.name };

    // 7. Active assignment for eng1 in Slice 11
    await prisma.projectAssignment.create({
      data: {
        projectId: p.id,
        engineerId: eng1.id,
        status: AssignmentStatus.ACTIVE,
        assignedById: mgr.id,
      },
    });

    // 8. Create a test milestone via Manager
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(managerUser);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(managerUser);

    const m = await createMilestone({
      projectId: p.id,
      title: 'محطة الصلاحيات',
      targetDate: '2026-11-01',
    });
    testMilestoneId = m.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (cleanupProjectIds.length > 0) {
      const ms = await prisma.projectMilestone.findMany({
        where: { projectId: { in: cleanupProjectIds } },
        select: { id: true },
      });
      const msIds = ms.map((m) => m.id);
      if (msIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entityType: 'PROJECT_MILESTONE',
            entityId: { in: msIds },
          },
        });
      }
      await prisma.projectMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.projectAssignment.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'PROJECT',
          entityId: { in: cleanupProjectIds },
        },
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

  describe('Manager full CRUD authority (BD-12-01)', () => {
    it('allows Manager all mutations and views', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(managerUser);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(managerUser);

      const list = await getProjectMilestones(testProject.id);
      expect(list.length).toBeGreaterThan(0);

      const updated = await updateMilestone(testMilestoneId, { title: 'تحديث المدير' });
      expect(updated.title).toBe('تحديث المدير');
    });
  });

  describe('Engineer visibility and assignment scoping (BD-12-02)', () => {
    it('allows assigned Engineer to view milestones', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);

      const list = await getProjectMilestones(testProject.id);
      expect(list.length).toBeGreaterThan(0);

      const single = await getProjectMilestone(testProject.id, testMilestoneId);
      expect(single.id).toBe(testMilestoneId);

      const summary = await getProjectMilestoneSummary(testProject.id);
      expect(summary.totalCount).toBeGreaterThan(0);
    });

    it('denies unassigned Engineer from viewing milestones', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(unassignedEngineer);

      await expect(getProjectMilestones(testProject.id)).rejects.toThrow(PermissionError);
      await expect(getProjectMilestone(testProject.id, testMilestoneId)).rejects.toThrow(PermissionError);
      await expect(getProjectMilestoneSummary(testProject.id)).rejects.toThrow(PermissionError);
    });

    it('denies Engineer from any mutations', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(
        createMilestone({ projectId: testProject.id, title: 'محاولة مهندس', targetDate: '2026-11-01' }),
      ).rejects.toThrow(PermissionError);

      await expect(
        updateMilestone(testMilestoneId, { title: 'محاولة مهندس' }),
      ).rejects.toThrow(PermissionError);

      await expect(completeMilestone(testMilestoneId)).rejects.toThrow(PermissionError);
      await expect(deleteMilestone(testMilestoneId)).rejects.toThrow(PermissionError);
    });
  });

  describe('Accountant view-only authority (BD-12-03)', () => {
    it('allows Accountant to view milestones', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(accountantUser);

      const list = await getProjectMilestones(testProject.id);
      expect(list.length).toBeGreaterThan(0);
    });

    it('denies Accountant from any mutations', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ACCOUNTANT),
      );

      await expect(deleteMilestone(testMilestoneId)).rejects.toThrow(PermissionError);
    });
  });

  describe('Purchasing view-only authority (BD-12-04)', () => {
    it('allows Purchasing to view milestones', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(purchasingUser);

      const list = await getProjectMilestones(testProject.id);
      expect(list.length).toBeGreaterThan(0);
    });

    it('denies Purchasing from any mutations', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.PURCHASING),
      );

      await expect(deleteMilestone(testMilestoneId)).rejects.toThrow(PermissionError);
    });
  });
});
