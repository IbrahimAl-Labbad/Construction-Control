/**
 * tests/integration/project-team-authorization.test.ts
 *
 * Vertical Slice 11 — Project Team & Engineer Assignment
 * Authorization & Access Control Integration Tests on Live PostgreSQL.
 *
 * Enforces:
 * - System-wide Manager authority: only Role.MANAGER can assign or remove engineers.
 * - Non-manager roles (ENGINEER, ACCOUNTANT, PURCHASING) cannot mutate project team.
 * - Inactive users are rejected on protected operations.
 * - Object-level authorization for getAssignedProjectsForEngineer:
 *   - Engineer can query their own assigned projects.
 *   - Engineer cannot query another engineer's assigned projects (IDOR protection).
 *   - Accountant and Purchasing cannot query engineer assigned projects.
 *   - Manager can query any engineer's assigned projects.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  assignEngineerToProject,
  removeEngineerFromProject,
  getProjectTeam,
  getActiveEngineersForAssignment,
  getAssignedProjectsForEngineer,
} from '@/lib/project-team';
import * as permissions from '@/lib/permissions';
import { Role, ProjectStatus } from '@prisma/client';
import { PermissionError } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Team Authorization Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer1: AuthenticatedUser;
  let testEngineer2: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupAssignmentIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير الصلاحيات للفريق',
        email: `mgr.auth.${Date.now()}.${Math.random()}@test.local`,
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

    // 2. Engineer 1
    const eng1 = await prisma.user.create({
      data: {
        name: 'مهندس أول للصلاحيات',
        email: `eng1.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng1.id);
    testEngineer1 = {
      id: eng1.id,
      name: eng1.name,
      email: eng1.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Engineer 2
    const eng2 = await prisma.user.create({
      data: {
        name: 'مهندس ثان للصلاحيات',
        email: `eng2.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng2.id);
    testEngineer2 = {
      id: eng2.id,
      name: eng2.name,
      email: eng2.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Accountant
    const acc = await prisma.user.create({
      data: {
        name: 'محاسب اختبار الصلاحيات',
        email: `acc.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ACCOUNTANT,
        isActive: true,
      },
    });
    cleanupUserIds.push(acc.id);
    testAccountant = {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };

    // 5. Purchasing
    const pur = await prisma.user.create({
      data: {
        name: 'مسؤول مشتريات الصلاحيات',
        email: `pur.auth.${Date.now()}.${Math.random()}@test.local`,
        role: Role.PURCHASING,
        isActive: true,
      },
    });
    cleanupUserIds.push(pur.id);
    testPurchasing = {
      id: pur.id,
      name: pur.name,
      email: pur.email,
      role: Role.PURCHASING,
      isActive: true,
    };

    // 6. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-ATH-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار الصلاحيات',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = prj;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const aId of cleanupAssignmentIds) {
      await prisma.projectAssignment.deleteMany({ where: { id: aId } });
    }
    cleanupAssignmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;

    for (const uId of cleanupUserIds) {
      await prisma.user.deleteMany({ where: { id: uId } });
    }
    cleanupUserIds.length = 0;
  });

  describe('Manager Assignment Authority (BD-11-02)', () => {
    it('denies assignEngineerToProject for non-manager roles', async () => {
      const nonManagers = [testEngineer1, testAccountant, testPurchasing];

      for (const nonManager of nonManagers) {
        vi.spyOn(permissions, 'requireAuth').mockResolvedValue(nonManager);
        vi.spyOn(permissions, 'requireManager').mockRejectedValue(
          new PermissionError('FORBIDDEN', [Role.MANAGER], nonManager.role),
        );

        await expect(
          assignEngineerToProject({
            projectId: testProject.id,
            engineerId: testEngineer2.id,
          }),
        ).rejects.toThrowError(PermissionError);
      }
    });

    it('denies removeEngineerFromProject for non-manager roles', async () => {
      // First assign an engineer as manager
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

      const assign = await assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer1.id,
      });
      cleanupAssignmentIds.push(assign.assignmentId);

      // Now test non-manager roles trying to remove
      const nonManagers = [testEngineer1, testAccountant, testPurchasing];

      for (const nonManager of nonManagers) {
        vi.spyOn(permissions, 'requireAuth').mockResolvedValue(nonManager);
        vi.spyOn(permissions, 'requireManager').mockRejectedValue(
          new PermissionError('FORBIDDEN', [Role.MANAGER], nonManager.role),
        );

        await expect(
          removeEngineerFromProject({
            projectId: testProject.id,
            assignmentId: assign.assignmentId,
            reason: 'محاولة استبعاد غير مصرح بها',
          }),
        ).rejects.toThrowError(PermissionError);
      }
    });

    it('blocks inactive manager on team mutations', async () => {
      vi.spyOn(permissions, 'requireAuth').mockRejectedValue(
        new AuthError('ACCOUNT_INACTIVE'),
      );
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new AuthError('ACCOUNT_INACTIVE'),
      );

      await expect(
        assignEngineerToProject({
          projectId: testProject.id,
          engineerId: testEngineer1.id,
        }),
      ).rejects.toThrowError(AuthError);
    });
  });

  describe('Project Team Query Access Control', () => {
    it('denies getProjectTeam and getActiveEngineersForAssignment to non-managers', async () => {
      const nonManagers = [testEngineer1, testAccountant, testPurchasing];

      for (const nonManager of nonManagers) {
        vi.spyOn(permissions, 'requireAuth').mockResolvedValue(nonManager);
        vi.spyOn(permissions, 'requireManager').mockRejectedValue(
          new PermissionError('FORBIDDEN', [Role.MANAGER], nonManager.role),
        );

        await expect(getProjectTeam(testProject.id)).rejects.toThrowError(PermissionError);
        await expect(getActiveEngineersForAssignment(testProject.id)).rejects.toThrowError(
          PermissionError,
        );
      }
    });
  });

  describe('Object-Level Access Control for getAssignedProjectsForEngineer', () => {
    it('allows an engineer to query their own assigned projects', async () => {
      // 1. Manager assigns engineer 1 to project
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

      const assign = await assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer1.id,
      });
      cleanupAssignmentIds.push(assign.assignmentId);

      // 2. Engineer 1 queries their own assigned projects
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer1);

      const projects = await getAssignedProjectsForEngineer(testEngineer1.id);
      expect(projects).toHaveLength(1);
      expect(projects[0]!.projectId).toBe(testProject.id);
    });

    it('denies an engineer from querying another engineer assigned projects (IDOR)', async () => {
      // Engineer 1 attempts to query Engineer 2's assigned projects
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer1);

      await expect(getAssignedProjectsForEngineer(testEngineer2.id)).rejects.toThrowError(
        PermissionError,
      );
    });

    it('denies Accountant and Purchasing from querying engineer assigned projects', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      await expect(getAssignedProjectsForEngineer(testEngineer1.id)).rejects.toThrowError(
        PermissionError,
      );

      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
      await expect(getAssignedProjectsForEngineer(testEngineer1.id)).rejects.toThrowError(
        PermissionError,
      );
    });

    it('allows Manager to query any engineer assigned projects', async () => {
      // Manager queries Engineer 1's assigned projects
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

      const projects = await getAssignedProjectsForEngineer(testEngineer1.id);
      expect(Array.isArray(projects)).toBe(true);
    });
  });
});
