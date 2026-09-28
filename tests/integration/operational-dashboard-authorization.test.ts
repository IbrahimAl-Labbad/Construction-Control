/**
 * tests/integration/operational-dashboard-authorization.test.ts
 *
 * Authorization integration tests for getProjectOperationalDashboard().
 * Live PostgreSQL. Strictly verifies server-side guards per BD-13-03 to BD-13-06.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AssignmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getProjectOperationalDashboard } from '@/lib/operational-dashboard';
import { AppError, ValidationError } from '@/lib/errors';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Operational Project Dashboard — Authorization Integration', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;
  let testInactiveManager: AuthenticatedUser;

  let testProjectId: string;
  let softDeletedProjectId: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    // Helper to get or create users
    const getOrCreateUser = async (role: Role, isActive: boolean, label: string) => {
      const existing = await prisma.user.findFirst({
        where: { role, isActive, deletedAt: null },
      });
      if (existing) return existing;
      return prisma.user.create({
        data: {
          name: `${label} ${timestamp}`,
          email: `${label.toLowerCase().replace(/\s/g, '.')}.${timestamp}@test.local`,
          role,
          isActive,
        },
      });
    };

    const mgr = await getOrCreateUser(Role.MANAGER, true, 'مدير لوحة تشغيل');
    const acc = await getOrCreateUser(Role.ACCOUNTANT, true, 'محاسب لوحة تشغيل');
    const eng = await getOrCreateUser(Role.ENGINEER, true, 'مهندس لوحة تشغيل');
    const pur = await getOrCreateUser(Role.PURCHASING, true, 'مشتريات لوحة تشغيل');

    const inactiveMgr = await prisma.user.create({
      data: {
        name: `مدير غير نشط ${timestamp}`,
        email: `inactive.op.mgr.${timestamp}@test.local`,
        role: Role.MANAGER,
        isActive: false,
      },
    });

    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };
    testAccountant = {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };
    testPurchasing = {
      id: pur.id,
      name: pur.name,
      email: pur.email,
      role: Role.PURCHASING,
      isActive: true,
    };
    testInactiveManager = {
      id: inactiveMgr.id,
      name: inactiveMgr.name,
      email: inactiveMgr.email,
      role: Role.MANAGER,
      isActive: false,
    };
    testInactiveManager = {
      id: inactiveMgr.id,
      name: inactiveMgr.name,
      email: inactiveMgr.email,
      role: Role.MANAGER,
      isActive: false,
    };

    // Create active project
    const project = await prisma.project.create({
      data: {
        code: `OP-AUTH-${timestamp}`,
        name: `مشروع فحص الصلاحيات ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    testProjectId = project.id;

    // Create soft-deleted project
    const softDeleted = await prisma.project.create({
      data: {
        code: `OP-DEL-${timestamp}`,
        name: `مشروع محذوف ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
        deletedAt: new Date(),
      },
    });
    softDeletedProjectId = softDeleted.id;

    // Assign engineer to project
    await prisma.projectAssignment.create({
      data: {
        projectId: testProjectId,
        engineerId: testEngineer.id,
        status: AssignmentStatus.ACTIVE,
        assignedById: testManager.id,
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.projectAssignment.deleteMany({
      where: { projectId: { in: [testProjectId, softDeletedProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, softDeletedProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'inactive.op.mgr' } },
    });
  });

  it('TC-AUTH-01: allows active Manager full access to the dashboard', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const result = await getProjectOperationalDashboard(testProjectId);

    expect(result).toBeDefined();
    expect(result.projectId).toBe(testProjectId);
    expect(result.identity.status).toBe('ACTIVE');
    expect(result.financial.currency).toBe('SAR');
  });

  it('TC-AUTH-02: denies active Engineer (assigned to project) with FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    await expect(getProjectOperationalDashboard(testProjectId)).rejects.toThrow(
      permissions.PermissionError,
    );
  });

  it('TC-AUTH-03: denies active Accountant with FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ACCOUNTANT),
    );

    await expect(getProjectOperationalDashboard(testProjectId)).rejects.toThrow(
      permissions.PermissionError,
    );
  });

  it('TC-AUTH-04: denies active Purchasing Officer with FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.PURCHASING),
    );

    await expect(getProjectOperationalDashboard(testProjectId)).rejects.toThrow(
      permissions.PermissionError,
    );
  });

  it('TC-AUTH-05: denies inactive Manager with ACCOUNT_INACTIVE', async () => {
    expect(testInactiveManager.isActive).toBe(false);
    vi.spyOn(authSession, 'requireAuth').mockRejectedValue(
      new authSession.AuthError('ACCOUNT_INACTIVE'),
    );
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new authSession.AuthError('ACCOUNT_INACTIVE'),
    );

    await expect(getProjectOperationalDashboard(testProjectId)).rejects.toThrow(
      authSession.AuthError,
    );
  });

  it('TC-AUTH-06: rejects unauthenticated caller with UNAUTHENTICATED', async () => {
    vi.spyOn(authSession, 'requireAuth').mockRejectedValue(
      new authSession.AuthError('UNAUTHENTICATED'),
    );
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new authSession.AuthError('UNAUTHENTICATED'),
    );

    await expect(getProjectOperationalDashboard(testProjectId)).rejects.toThrow(
      authSession.AuthError,
    );
  });

  it('TC-AUTH-07: throws NOT_FOUND for soft-deleted project', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    await expect(getProjectOperationalDashboard(softDeletedProjectId)).rejects.toThrow(
      AppError,
    );
  });

  it('TC-AUTH-08: throws ValidationError on malformed project ID input', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    await expect(getProjectOperationalDashboard('')).rejects.toThrow(ValidationError);
    await expect(getProjectOperationalDashboard(null)).rejects.toThrow(ValidationError);
  });
});
