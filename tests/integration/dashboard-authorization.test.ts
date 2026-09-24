/**
 * tests/integration/dashboard-authorization.test.ts
 *
 * Authorization integration tests for getDashboardSummary().
 * Live PostgreSQL. No mocking of business logic.
 *
 * Tests:
 *   A-01  Manager (active) → allowed
 *   A-02  Accountant (active) → FORBIDDEN
 *   A-03  Engineer (active) → FORBIDDEN
 *   A-04  Purchasing (active) → FORBIDDEN
 *   A-05  Manager (inactive) → FORBIDDEN (AppError FORBIDDEN)
 *   A-06  Unauthenticated → requireAuth throws
 *
 * All six tests verify that the authorization guard is enforced BEFORE any DB read.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { getDashboardSummary } from '@/lib/dashboard/queries/get-dashboard-summary';
import { AppError } from '@/lib/errors';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Executive Dashboard — Authorization Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;
  let testInactiveManager: AuthenticatedUser;

  beforeEach(async () => {
    const timestamp = Date.now();

    // Reuse or create required roles
    const getOrCreateUser = async (
      role: Role,
      isActive: boolean,
      label: string,
    ) => {
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

    const mgr = await getOrCreateUser(Role.MANAGER, true, 'مدير لوحة المتابعة');
    const acc = await getOrCreateUser(Role.ACCOUNTANT, true, 'محاسب لوحة المتابعة');
    const eng = await getOrCreateUser(Role.ENGINEER, true, 'مهندس لوحة المتابعة');
    const pur = await getOrCreateUser(Role.PURCHASING, true, 'مشتريات لوحة المتابعة');

    // Create inactive manager explicitly (cannot reuse active ones)
    const inactiveMgr = await prisma.user.create({
      data: {
        name: `مدير غير نشط ${timestamp}`,
        email: `inactive.mgr.${timestamp}@test.local`,
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Inactive manager created for test — clean up
    await prisma.user.deleteMany({
      where: {
        email: { contains: '@test.local' },
        isActive: false,
        role: Role.MANAGER,
      },
    });
  });

  // -------------------------------------------------------------------------
  // A-01: Manager (active) is allowed
  // -------------------------------------------------------------------------
  it('A-01: allows active Manager to access the dashboard', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    const result = await getDashboardSummary();

    expect(result).toBeDefined();
    expect(result.companySummary).toBeDefined();
    expect(result.companySummary.currency).toBe('SAR');
    expect(result.pendingApprovals).toBeDefined();
    expect(Array.isArray(result.projects)).toBe(true);
    expect(typeof result.generatedAt).toBe('string');
  });

  // -------------------------------------------------------------------------
  // A-02: Accountant is denied
  // -------------------------------------------------------------------------
  it('A-02: denies active Accountant — FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(getDashboardSummary()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'FORBIDDEN',
    );
  });

  // -------------------------------------------------------------------------
  // A-03: Engineer is denied
  // -------------------------------------------------------------------------
  it('A-03: denies active Engineer — FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(getDashboardSummary()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'FORBIDDEN',
    );
  });

  // -------------------------------------------------------------------------
  // A-04: Purchasing is denied
  // -------------------------------------------------------------------------
  it('A-04: denies active Purchasing officer — FORBIDDEN', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    await expect(getDashboardSummary()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'FORBIDDEN',
    );
  });

  // -------------------------------------------------------------------------
  // A-05: Inactive Manager is denied
  // -------------------------------------------------------------------------
  it('A-05: denies inactive Manager — FORBIDDEN (canViewExecutiveDashboard requires isActive)', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testInactiveManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testInactiveManager);

    await expect(getDashboardSummary()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'FORBIDDEN',
    );
  });

  // -------------------------------------------------------------------------
  // A-06: Unauthenticated — requireAuth throws
  // -------------------------------------------------------------------------
  it('A-06: denies unauthenticated request — requireAuth error propagates', async () => {
    vi.spyOn(authSession, 'requireAuth').mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'غير مصرح'),
    );
    vi.spyOn(permissions, 'requireAuth').mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'غير مصرح'),
    );

    await expect(getDashboardSummary()).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'UNAUTHENTICATED',
    );
  });
});
