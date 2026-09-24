/**
 * tests/integration/project-team-atomicity.test.ts
 *
 * Vertical Slice 11 — Project Team & Engineer Assignment
 * Integration tests proving atomic execution of ProjectAssignment mutations and AuditLog.
 *
 * Requirements:
 * - AGENTS.md §21: Audit logs must be written in the same transaction as the audited operation.
 * - Failed audit log writes must roll back the entire transaction.
 * - Real PostgreSQL database transactions (not mocked away).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  assignEngineerToProject,
  removeEngineerFromProject,
} from '@/lib/project-team';
import * as permissions from '@/lib/permissions';
import { Role, ProjectStatus, AssignmentStatus } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Team Audit Atomicity (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupAssignmentIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير اختبار الذرية',
        email: `mgr.atom.${Date.now()}.${Math.random()}@test.local`,
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

    // 2. Engineer
    const eng = await prisma.user.create({
      data: {
        name: 'مهندس اختبار الذرية',
        email: `eng.atom.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng.id);
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-ATM-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار الذرية للفريق',
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

  it('rolls back initial assignment if audit log creation fails inside transaction', async () => {
    // Intercept transaction client to simulate audit failure in live PostgreSQL transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_AUDIT_LOG_FAILURE');
        });
        return callback(tx);
      }, ...args);
    });

    await expect(
      assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer.id,
        reason: 'محاولة تعيين ستفشل في التدقيق',
      }),
    ).rejects.toThrow('SIMULATED_AUDIT_LOG_FAILURE');

    // Verify rollback: no ProjectAssignment exists in DB
    const dbAssignment = await prisma.projectAssignment.findUnique({
      where: {
        projectId_engineerId: {
          projectId: testProject.id,
          engineerId: testEngineer.id,
        },
      },
    });
    expect(dbAssignment).toBeNull();

    // Verify rollback: no AuditLog exists
    const dbAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_ASSIGNED',
      },
    });
    expect(dbAudit).toBeNull();
  });

  it('rolls back engineer removal if audit log creation fails inside transaction', async () => {
    // 1. Create a successful assignment first
    const assignResult = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer.id,
    });
    cleanupAssignmentIds.push(assignResult.assignmentId);

    // 2. Mock audit failure for removal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_REMOVAL_AUDIT_FAILURE');
        });
        return callback(tx);
      }, ...args);
    });

    await expect(
      removeEngineerFromProject({
        projectId: testProject.id,
        assignmentId: assignResult.assignmentId,
        reason: 'سبب استبعاد سيتراجع',
      }),
    ).rejects.toThrow('SIMULATED_REMOVAL_AUDIT_FAILURE');

    // 3. Verify rollback: assignment remains ACTIVE in DB
    const dbAssignment = await prisma.projectAssignment.findUnique({
      where: { id: assignResult.assignmentId },
    });
    expect(dbAssignment).not.toBeNull();
    expect(dbAssignment?.status).toBe(AssignmentStatus.ACTIVE);
    expect(dbAssignment?.removalReason).toBeNull();
    expect(dbAssignment?.removedById).toBeNull();
    expect(dbAssignment?.removedAt).toBeNull();

    // Verify no PROJECT_ENGINEER_REMOVED audit log exists
    const removalAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_REMOVED',
      },
    });
    expect(removalAudit).toBeNull();
  });

  it('rolls back reactivation if audit log creation fails inside transaction', async () => {
    // 1. Create assignment and remove it
    const assignResult = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer.id,
    });
    cleanupAssignmentIds.push(assignResult.assignmentId);

    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: assignResult.assignmentId,
      reason: 'استبعاد أولي',
    });

    // Verify it is currently INACTIVE
    const initialInactive = await prisma.projectAssignment.findUnique({
      where: { id: assignResult.assignmentId },
    });
    expect(initialInactive?.status).toBe(AssignmentStatus.INACTIVE);

    // 2. Mock audit failure during reactivation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_REACTIVATION_AUDIT_FAILURE');
        });
        return callback(tx);
      }, ...args);
    });

    await expect(
      assignEngineerToProject({
        projectId: testProject.id,
        engineerId: testEngineer.id,
        reason: 'إعادة تعيين ستفشل في التدقيق',
      }),
    ).rejects.toThrow('SIMULATED_REACTIVATION_AUDIT_FAILURE');

    // 3. Verify rollback: assignment remains INACTIVE
    const rolledBack = await prisma.projectAssignment.findUnique({
      where: { id: assignResult.assignmentId },
    });
    expect(rolledBack?.status).toBe(AssignmentStatus.INACTIVE);
    expect(rolledBack?.removalReason).toBe('استبعاد أولي');

    // Verify no reactivation audit log entry was committed
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_ASSIGNED',
      },
    });
    // Exactly 1 log from the initial assignment, not 2
    expect(auditLogs).toHaveLength(1);
    expect((auditLogs[0]!.metadata as Record<string, unknown>)?.['isReactivation']).toBe(false);
  });
});
