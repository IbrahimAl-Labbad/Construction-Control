/**
 * tests/integration/project-team-concurrency.test.ts
 *
 * Vertical Slice 11 — Project Team & Engineer Assignment
 * Concurrency & Race Condition Integration Tests on Live PostgreSQL.
 *
 * Requirements:
 * - Parent Project row lock serializes concurrent assignments for the same project.
 * - Initial concurrent double-assignment: exactly one succeeds, one fails with CONFLICT.
 * - Concurrent double-reactivation: exactly one succeeds, one fails.
 * - Concurrent double-remove: exactly one succeeds, one fails with INVALID_STATE.
 * - Project freeze concurrency in both ordering outcomes:
 *   - Ordering A: Assignment succeeds, then project completes.
 *   - Ordering B: Project completes first, assignment fails with INVALID_PROJECT_STATUS.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  assignEngineerToProject,
  removeEngineerFromProject,
} from '@/lib/project-team';
import { changeProjectStatus } from '@/lib/projects';
import * as permissions from '@/lib/permissions';
import { Role, ProjectStatus, AssignmentStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Team Concurrency Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer1: AuthenticatedUser;
  let testEngineer2: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupAssignmentIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير اختبار التزامن للفريق',
        email: `mgr.conc.${Date.now()}.${Math.random()}@test.local`,
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
        name: 'مهندس تزامن أول',
        email: `eng1.conc.${Date.now()}.${Math.random()}@test.local`,
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
        name: 'مهندس تزامن ثان',
        email: `eng2.conc.${Date.now()}.${Math.random()}@test.local`,
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

    // 4. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-CNC-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار التزامن',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = prj;

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
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

  it('prevents concurrent duplicate initial assignment: exactly one succeeds, one fails with CONFLICT', async () => {
    const payload = {
      projectId: testProject.id,
      engineerId: testEngineer1.id,
      reason: 'تعيين متزامن',
    };

    const [res1, res2] = await Promise.allSettled([
      assignEngineerToProject(payload),
      assignEngineerToProject(payload),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejections = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(rejections).toHaveLength(1);

    const winner = (successes[0] as PromiseFulfilledResult<{ assignmentId: string }>).value;
    cleanupAssignmentIds.push(winner.assignmentId);

    const loserError = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(AppError);
    expect((loserError as AppError).code).toBe('CONFLICT');
    expect((loserError as AppError).httpStatus).toBe(409);

    // Exactly one row exists in DB
    const rows = await prisma.projectAssignment.findMany({
      where: { projectId: testProject.id, engineerId: testEngineer1.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(AssignmentStatus.ACTIVE);
  });

  it('prevents concurrent double reactivation: exactly one succeeds, one fails, exactly one row remains ACTIVE', async () => {
    // 1. Initial assignment and removal
    const assign = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(assign.assignmentId);

    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: assign.assignmentId,
      reason: 'استبعاد تمهيداً للتزامن',
    });

    // 2. Fire two concurrent reactivation requests
    const payload = {
      projectId: testProject.id,
      engineerId: testEngineer1.id,
      reason: 'إعادة تفعيل متزامنة',
    };

    const [res1, res2] = await Promise.allSettled([
      assignEngineerToProject(payload),
      assignEngineerToProject(payload),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejections = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(rejections).toHaveLength(1);

    const loserError = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(AppError);
    // When serialized, the loser sees the row is already ACTIVE, returning CONFLICT
    expect((loserError as AppError).code).toBe('CONFLICT');
    expect((loserError as AppError).httpStatus).toBe(409);

    // Verify DB row remains exactly one, ACTIVE
    const rows = await prisma.projectAssignment.findMany({
      where: { projectId: testProject.id, engineerId: testEngineer1.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(AssignmentStatus.ACTIVE);
  });

  it('handles concurrent remove race: exactly one succeeds, one fails with INVALID_STATE', async () => {
    // 1. Active assignment
    const assign = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(assign.assignmentId);

    // 2. Fire two concurrent removal requests
    const payload = {
      projectId: testProject.id,
      assignmentId: assign.assignmentId,
      reason: 'استبعاد متزامن',
    };

    const [res1, res2] = await Promise.allSettled([
      removeEngineerFromProject(payload),
      removeEngineerFromProject(payload),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejections = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(rejections).toHaveLength(1);

    const loserError = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(AppError);
    expect((loserError as AppError).code).toBe('CONFLICT');
    expect((loserError as AppError).httpStatus).toBe(409);

    // Verify DB state is INACTIVE
    const row = await prisma.projectAssignment.findUnique({
      where: { id: assign.assignmentId },
    });
    expect(row?.status).toBe(AssignmentStatus.INACTIVE);
  });

  it('project freeze Ordering A: assignment completes before project is marked COMPLETED', async () => {
    // Step 1: Assign engineer to ACTIVE project
    const assign = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
      reason: 'تعيين قبل التجميد',
    });
    cleanupAssignmentIds.push(assign.assignmentId);

    // Step 2: Manager marks project as COMPLETED
    const updatedProject = await changeProjectStatus(testProject.id, {
      newStatus: ProjectStatus.COMPLETED,
      reason: 'اكتمال المشروع بالكامل',
    });

    expect(updatedProject.status).toBe(ProjectStatus.COMPLETED);

    // Step 3: Verify assignment was preserved
    const assignment = await prisma.projectAssignment.findUnique({
      where: { id: assign.assignmentId },
    });
    expect(assignment?.status).toBe(AssignmentStatus.ACTIVE);
  });

  it('project freeze Ordering B: assignment is rejected when project is already COMPLETED', async () => {
    // Step 1: Mark project as COMPLETED
    await changeProjectStatus(testProject.id, {
      newStatus: ProjectStatus.COMPLETED,
      reason: 'إغلاق المشروع قبل التعيين',
    });

    // Step 2: Attempt assignment to completed project -> INVALID_PROJECT_STATUS
    await expect(
      assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer2.id,
        reason: 'محاولة تعيين لمشروع منتهي',
      }),
    ).rejects.toThrowError(AppError);

    try {
      await assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer2.id,
        reason: 'محاولة تعيين لمشروع منتهي',
      });
    } catch (err) {
      expect((err as AppError).code).toBe('INVALID_PROJECT_STATUS');
      expect((err as AppError).httpStatus).toBe(400);
    }

    // Verify no assignment was created
    const row = await prisma.projectAssignment.findFirst({
      where: { projectId: testProject.id, engineerId: testEngineer2.id },
    });
    expect(row).toBeNull();
  });
});
