/**
 * tests/integration/approvals-auth.test.ts
 *
 * Authorization integration tests for the Centralized Manager Approvals Hub queries.
 * Live PostgreSQL. Verifies that all approvals queries require Role.MANAGER.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  getPendingCounts,
  getPendingExpenses,
  getPendingCommitments,
  getPendingCustodies,
  getPendingPayroll,
  getPendingBillings,
  getAllTabTriage,
} from '@/lib/approvals';
import { PermissionError } from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Approvals Hub — Authorization Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;
  let testInactiveManager: AuthenticatedUser;

  beforeEach(async () => {
    const timestamp = Date.now();

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

    const mgr = await getOrCreateUser(Role.MANAGER, true, 'مدير الموافقات');
    const acc = await getOrCreateUser(Role.ACCOUNTANT, true, 'محاسب الموافقات');
    const eng = await getOrCreateUser(Role.ENGINEER, true, 'مهندس الموافقات');
    const pur = await getOrCreateUser(Role.PURCHASING, true, 'مشتريات الموافقات');

    const inactiveMgr = await prisma.user.create({
      data: {
        name: `مدير غير نشط ${timestamp}`,
        email: `inactive.approvals.${timestamp}@test.local`,
        role: Role.MANAGER,
        isActive: false,
      },
    });

    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };
    testAccountant = { id: acc.id, name: acc.name, email: acc.email, role: Role.ACCOUNTANT, isActive: true };
    testEngineer = { id: eng.id, name: eng.name, email: eng.email, role: Role.ENGINEER, isActive: true };
    testPurchasing = { id: pur.id, name: pur.name, email: pur.email, role: Role.PURCHASING, isActive: true };
    testInactiveManager = { id: inactiveMgr.id, name: inactiveMgr.name, email: inactiveMgr.email, role: Role.MANAGER, isActive: false };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'inactive.approvals.' },
      },
    });
  });

  it('allows active MANAGER to execute getPendingCounts() and getAllTabTriage()', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    const counts = await getPendingCounts();
    expect(counts).toBeDefined();
    expect(typeof counts.total).toBe('number');

    const triage = await getAllTabTriage();
    expect(triage).toBeDefined();
    expect(triage.activeTab).toBe('all');
    expect(Array.isArray(triage.items)).toBe(true);
  });

  it('denies active ENGINEER calling any approvals query — PermissionError INSUFFICIENT_ROLE', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(getPendingCounts()).rejects.toThrow(PermissionError);
    await expect(getPendingExpenses()).rejects.toThrow(PermissionError);
    await expect(getPendingCommitments()).rejects.toThrow(PermissionError);
    await expect(getPendingCustodies()).rejects.toThrow(PermissionError);
    await expect(getPendingPayroll()).rejects.toThrow(PermissionError);
    await expect(getPendingBillings()).rejects.toThrow(PermissionError);
    await expect(getAllTabTriage()).rejects.toThrow(PermissionError);
  });

  it('denies active ACCOUNTANT calling any approvals query — PermissionError INSUFFICIENT_ROLE', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(getPendingCounts()).rejects.toThrow(PermissionError);
    await expect(getPendingExpenses()).rejects.toThrow(PermissionError);
    await expect(getPendingCommitments()).rejects.toThrow(PermissionError);
    await expect(getPendingCustodies()).rejects.toThrow(PermissionError);
    await expect(getPendingPayroll()).rejects.toThrow(PermissionError);
    await expect(getPendingBillings()).rejects.toThrow(PermissionError);
    await expect(getAllTabTriage()).rejects.toThrow(PermissionError);
  });

  it('denies active PURCHASING calling any approvals query — PermissionError INSUFFICIENT_ROLE', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    await expect(getPendingCounts()).rejects.toThrow(PermissionError);
    await expect(getPendingExpenses()).rejects.toThrow(PermissionError);
    await expect(getPendingCommitments()).rejects.toThrow(PermissionError);
    await expect(getPendingCustodies()).rejects.toThrow(PermissionError);
    await expect(getPendingPayroll()).rejects.toThrow(PermissionError);
    await expect(getPendingBillings()).rejects.toThrow(PermissionError);
    await expect(getAllTabTriage()).rejects.toThrow(PermissionError);
  });

  it('denies inactive MANAGER — blocked at requireAuth', async () => {
    expect(testInactiveManager.isActive).toBe(false);

    vi.spyOn(authSession, 'requireAuth').mockRejectedValue(
      new AppError('ACCOUNT_INACTIVE', 'المستخدم غير نشط')
    );
    vi.spyOn(permissions, 'requireAuth').mockRejectedValue(
      new AppError('ACCOUNT_INACTIVE', 'المستخدم غير نشط')
    );

    await expect(getPendingCounts()).rejects.toSatisfy(
      (err: unknown) => err instanceof AppError && err.code === 'ACCOUNT_INACTIVE'
    );
  });

  it('payroll query never executes for ENGINEER or PURCHASING roles', async () => {
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(getPendingPayroll()).rejects.toThrow(PermissionError);

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    await expect(getPendingPayroll()).rejects.toThrow(PermissionError);
  });
});
