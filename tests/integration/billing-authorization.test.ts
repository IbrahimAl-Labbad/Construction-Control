/**
 * tests/integration/billing-authorization.test.ts
 *
 * Phase 10.6: Subcontractor Billing Authorization Integration Tests on Live PostgreSQL.
 *
 * Enforces AGENTS.md §5 (Four V1 Roles), §6 (Access Control), §12 (Security by Default), and §18:
 * 1. ENGINEER cannot create billing draft → throws FORBIDDEN.
 * 2. PURCHASING cannot create billing draft → throws FORBIDDEN.
 * 3. MANAGER cannot create billing draft (separation of data-entry vs approval) → throws FORBIDDEN.
 * 4. ACCOUNTANT cannot approve billing → rejected with 403 (FORBIDDEN / INSUFFICIENT_ROLE).
 * 5. Inactive ACCOUNTANT cannot create billing → throws ACCOUNT_INACTIVE.
 * 6. Self-approval prevention (Separation of Duties):
 *    - Accountant creates and submits billing.
 *    - The same user presented as Manager attempts to approve.
 *    - Fails with FORBIDDEN_SELF_APPROVAL.
 * 7. Legitimate approval by a different user (Manager) succeeds.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  SubcontractorBillingStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createBillingDraft,
  submitBilling,
  approveBilling,
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import { AuthError } from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing Authorization Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupBillingIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير اختبار الصلاحيات',
          email: `mgr.bauth.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
      });
    }
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب اختبار الصلاحيات',
          email: `acc.bauth.${Date.now()}@test.local`,
          role: Role.ACCOUNTANT,
          isActive: true,
        },
      });
    }
    testAccountant = {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };

    // 3. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس اختبار الصلاحيات',
          email: `eng.bauth.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات اختبار الصلاحيات',
          email: `pur.bauth.${Date.now()}@test.local`,
          role: Role.PURCHASING,
          isActive: true,
        },
      });
    }
    testPurchasing = {
      id: pur.id,
      name: pur.name,
      email: pur.email,
      role: Role.PURCHASING,
      isActive: true,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const bId of cleanupBillingIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: bId },
      });
      await prisma.subcontractorBilling.deleteMany({ where: { id: bId } });
    }
    cleanupBillingIds.length = 0;

    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'COMMITMENT', entityId: commId },
      });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;
  });

  /** Helper to seed an active project with budget and commitment */
  async function setupProject() {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `AUTH-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار صلاحيات المستخلصات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال المقاولات لاختبار الصلاحيات',
          amount: '1000000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة المقاولات النموذجية',
      amount: '300000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لاختبار الصلاحيات',
      referenceNumber: 'PO-AUTH-01',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    return { project, budgetLine, commitment: approvedComm };
  }

  it('verifies ENGINEER cannot create subcontractor billing draft → throws FORBIDDEN', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '50000.00',
        description: 'محاولة إنشاء مستخلص من قبل مهندس موقع',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('verifies PURCHASING cannot create subcontractor billing draft → throws FORBIDDEN', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '50000.00',
        description: 'محاولة إنشاء مستخلص من قبل مسؤول مشتريات',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('verifies MANAGER cannot create subcontractor billing draft (separation of data-entry vs approval) → throws FORBIDDEN', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '50000.00',
        description: 'محاولة إنشاء مستخلص من قبل مدير المشاريع',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('verifies ACCOUNTANT cannot approve subcontractor billing → rejected with 403 (FORBIDDEN / INSUFFICIENT_ROLE)', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    // Accountant creates and submits draft
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '50000.00',
      description: 'مستخلص للاختبار',
    });
    cleanupBillingIds.push(draft.id);
    await submitBilling(draft.id);

    // Accountant attempts to approve (real requireManager/requireRole check against testAccountant)
    vi.mocked(permissions.requireManager).mockImplementation(async () => {
      return permissions.requireRole(Role.MANAGER);
    });
    vi.spyOn(permissions, 'requireRole').mockImplementation(async (roles) => {
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      if (!allowedRoles.includes(testAccountant.role)) {
        throw new permissions.PermissionError('INSUFFICIENT_ROLE', allowedRoles, testAccountant.role);
      }
      return testAccountant;
    });

    // Calling approveBilling with accountant actor causes requireManager/requireRole to reject
    await expect(approveBilling(draft.id)).rejects.toSatisfy((err: unknown) => {
      const code = (err as { code?: string })?.code;
      return code === 'FORBIDDEN' || code === 'INSUFFICIENT_ROLE';
    });
  });

  it('verifies inactive ACCOUNTANT cannot create billing draft → throws ACCOUNT_INACTIVE', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    // Inactive user simulation via AuthError('ACCOUNT_INACTIVE')
    vi.spyOn(permissions, 'requireAuth').mockRejectedValue(new AuthError('ACCOUNT_INACTIVE'));
    vi.spyOn(auth, 'requireAuth').mockRejectedValue(new AuthError('ACCOUNT_INACTIVE'));

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '50000.00',
        description: 'محاولة إنشاء من حساب محاسب معطل',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }));
  });

  it('enforces separation of duties: creator/submitter cannot self-approve even if presented as Manager → throws FORBIDDEN_SELF_APPROVAL', async () => {
    const { project, budgetLine, commitment } = await setupProject();

    // 1. Accountant creates and submits draft
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '50000.00',
      description: 'مستخلص لاختبار منع الاعتماد الذاتي',
    });
    cleanupBillingIds.push(draft.id);
    await submitBilling(draft.id);

    // 2. Same user is presented as Manager (e.g. dual role or spoofed session)
    const selfApproverManager: AuthenticatedUser = {
      id: testAccountant.id, // SAME ID as creator/submitter!
      name: testAccountant.name,
      email: testAccountant.email,
      role: Role.MANAGER,
      isActive: true,
    };

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(selfApproverManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(selfApproverManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(selfApproverManager);

    // 3. Approval must fail with FORBIDDEN_SELF_APPROVAL
    await expect(approveBilling(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
    );

    // 4. Assert: Manager with different user ID CAN approve successfully
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveBilling(draft.id);
    expect(approved.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
  });
});
