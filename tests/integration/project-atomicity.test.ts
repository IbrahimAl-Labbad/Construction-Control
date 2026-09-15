/**
 * tests/integration/project-atomicity.test.ts
 *
 * Integration tests proving atomic execution of Project creation and AuditLog.
 *
 * Requirements (Constraint 5):
 * - Successful project creation creates its AuditLog in the live database.
 * - Simulated audit failure rolls back project creation in the live database.
 * - Real PostgreSQL database transactions (not mocked away).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createProject } from '@/lib/projects';
import * as permissions from '@/lib/permissions';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Creation Audit Atomicity (Live DB Integration)', () => {
  let testManager: { id: string; name: string; email: string; role: Role; isActive: boolean };
  const createdProjectIds: string[] = [];

  beforeEach(async () => {
    // Ensure we have a valid, active MANAGER in the database
    let manager = await prisma.user.findFirst({
      where: {
        role: Role.MANAGER,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!manager) {
      manager = await prisma.user.create({
        data: {
          name: 'مدير الاختبار التكاملي',
          email: `test.int.manager.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    testManager = manager;

    const authManager: AuthenticatedUser = {
      id: testManager.id,
      name: testManager.name,
      email: testManager.email,
      role: Role.MANAGER,
      isActive: true,
    };

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(authManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Clean up created projects and their audit logs
    for (const id of createdProjectIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'PROJECT', entityId: id },
      });
      await prisma.project.deleteMany({
        where: { id },
      });
    }
    createdProjectIds.length = 0;
  });

  it('proves successful project creation creates its AuditLog in the same transaction', async () => {
    const uniqueCode = `PRJ-${Math.floor(Math.random() * 89999 + 10000)}`;
    const input = {
      code: uniqueCode,
      name: 'مشروع اختبار التكامل الذري',
      description: 'فحص كتابة المشروع وسجل التدقيق ذرياً',
      managerId: testManager.id,
    };

    const project = await createProject(input);
    createdProjectIds.push(project.id);

    // 1. Verify Project was persisted to PostgreSQL
    const dbProject = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(dbProject).not.toBeNull();
    expect(dbProject?.code).toBe(uniqueCode);

    // 2. Verify AuditLog was persisted to PostgreSQL
    const dbAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        entityId: project.id,
        action: 'PROJECT_CREATED',
      },
    });

    expect(dbAudit).not.toBeNull();
    expect(dbAudit?.actorId).toBe(testManager.id);
    expect((dbAudit?.metadata as Record<string, unknown>)?.['code']).toBe(uniqueCode);
  });

  it('proves simulated audit failure rolls back project creation in PostgreSQL', async () => {
    const uniqueCode = `PRJ-F-${Math.floor(Math.random() * 89999 + 10000)}`;
    const input = {
      code: uniqueCode,
      name: 'مشروع فحص التراجع الذري',
      managerId: testManager.id,
    };

    // Intercept transaction client to simulate audit failure in live PostgreSQL transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma as any).$transaction.bind(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, ...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalTransaction(async (tx: any) => {
        // Force the audit log write inside tx to fail
        tx.auditLog.create = vi.fn().mockImplementation(async () => {
          throw new Error('SIMULATED_AUDIT_WRITE_ERROR');
        });
        return callback(tx);
      }, ...args);
    });

    // The creation should fail due to the simulated audit log failure
    await expect(createProject(input)).rejects.toThrow('SIMULATED_AUDIT_WRITE_ERROR');

    // Verify rollback: Project must NOT exist in the database
    const rolledBackProject = await prisma.project.findUnique({
      where: { code: uniqueCode },
    });
    expect(rolledBackProject).toBeNull();

    // Verify audit log also does not exist
    const orphanAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        action: 'PROJECT_CREATED',
        metadata: {
          path: ['code'],
          equals: uniqueCode,
        },
      },
    });
    expect(orphanAudit).toBeNull();
  });
});
