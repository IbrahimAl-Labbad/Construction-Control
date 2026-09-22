/**
 * tests/integration/billing-concurrency.test.ts
 *
 * Phase 10.3: Subcontractor Billing Approval Concurrency Integration Tests on Live PostgreSQL.
 *
 * Proves that hierarchical row-level locking:
 *   budget_lines → commitments → subcontractor_billings
 * serializes concurrent billing approvals and strictly enforces the commitment ceiling.
 *
 * Test Setup:
 * 1. Seed Active Project with Approved Budget.
 * 2. Seed Approved Commitment of 400,000.00 SAR.
 * 3. Seed two SUBMITTED billings:
 *    - Billing A = 300,000.00 SAR
 *    - Billing B = 300,000.00 SAR
 *    (Combined requested = 600,000.00 SAR > 400,000.00 SAR ceiling).
 * 4. Dispatch genuinely concurrent approveBilling transactions in parallel via Promise.allSettled:
 *    Promise.allSettled([approveBilling(A.id), approveBilling(B.id)])
 * 5. Assert:
 *    - Exactly one fulfilled.
 *    - Exactly one rejected with COMMITMENT_CEILING_EXCEEDED.
 * 6. Query PostgreSQL directly to verify final DB state:
 *    - Exactly one billing is APPROVED with grossAmount = 300,000.00 SAR.
 *    - The other billing remains SUBMITTED.
 *    - SUM(APPROVED billings) = 300,000.00 SAR and NEVER > 400,000.00 SAR.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  SubcontractorBillingStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createBillingDraft,
  submitBilling,
  approveBilling,
  getCommitmentBillings,
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing Concurrency Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
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
          name: 'مدير سباق المستخلصات',
          email: `mgr.bconc.${Date.now()}@test.local`,
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
          name: 'محاسب سباق المستخلصات',
          email: `acc.bconc.${Date.now()}@test.local`,
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

    // 3. Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات سباق المستخلصات',
          email: `pur.bconc.${Date.now()}@test.local`,
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

    // By default, approve actions use testManager
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
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

  it('proves hierarchical row locking protects commitment ceiling under concurrent billing approvals', async () => {
    // -------------------------------------------------------------------------
    // 1. Setup: Active Project + Approved Budget + Commitment = 400,000.00 SAR
    // -------------------------------------------------------------------------
    const project = await createProject({
      code: `CONC-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن اعتماد مستخلصات مقاولي الباطن',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال المقاولات الإنشائية',
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

    // Purchasing creates and submits Commitment of 400,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة البناء والتشييد المتقدمة',
      amount: '400000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لتوريد وتنفيذ أعمال الخرسانة',
      referenceNumber: 'PO-RACE-400K',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);

    await submitCommitment(commitmentDraft.id);

    // Manager approves commitment
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const commitment = await approveCommitment(commitmentDraft.id);
    expect(commitment.amount).toBe('400000.00');

    // -------------------------------------------------------------------------
    // 2. Accountant creates TWO SUBMITTED billings:
    //    Billing A = 300,000.00 SAR
    //    Billing B = 300,000.00 SAR
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraftA = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-01',
      claimDate: new Date('2026-01-31'),
      grossAmount: '300000.00',
      description: 'مستخلص سباق أ - 300 ألف',
    });
    cleanupBillingIds.push(billingDraftA.id);
    await submitBilling(billingDraftA.id);

    const billingDraftB = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-02',
      claimDate: new Date('2026-02-28'),
      grossAmount: '300000.00',
      description: 'مستخلص سباق ب - 300 ألف',
    });
    cleanupBillingIds.push(billingDraftB.id);
    await submitBilling(billingDraftB.id);

    // -------------------------------------------------------------------------
    // 3. Dispatch genuinely concurrent approvals in parallel via Promise.allSettled
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [resultA, resultB] = await Promise.allSettled([
      approveBilling(billingDraftA.id),
      approveBilling(billingDraftB.id),
    ]);

    // -------------------------------------------------------------------------
    // 4. Assert: Exactly one fulfilled and exactly one rejected
    // -------------------------------------------------------------------------
    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('COMMITMENT_CEILING_EXCEEDED');

    // -------------------------------------------------------------------------
    // 5. Independently query PostgreSQL to verify final DB state
    // -------------------------------------------------------------------------
    const dbBillings = await prisma.subcontractorBilling.findMany({
      where: {
        commitmentId: commitment.id,
        deletedAt: null,
      },
    });

    const approvedBillings = dbBillings.filter(
      (b) => b.status === SubcontractorBillingStatus.APPROVED,
    );
    const submittedBillings = dbBillings.filter(
      (b) => b.status === SubcontractorBillingStatus.SUBMITTED,
    );

    // Exactly 1 billing was approved, exactly 1 remains submitted
    expect(approvedBillings.length).toBe(1);
    expect(submittedBillings.length).toBe(1);

    const totalApprovedGross = approvedBillings.reduce(
      (sum, b) => sum.add(b.grossAmount),
      new Prisma.Decimal('0.00'),
    );

    // CRITICAL PROOF: SUM(APPROVED billings) = 300,000.00 and NEVER > 400,000.00
    expect(totalApprovedGross.toFixed(2)).toBe('300000.00');
    expect(totalApprovedGross.lessThanOrEqualTo(new Prisma.Decimal('400000.00'))).toBe(true);

    // Check summary DTO reflects exact DB state
    const summary = await getCommitmentBillings(commitment.id);
    expect(summary.cumulativeCertified).toBe('300000.00');
    expect(summary.remainingCommitmentBalance).toBe('100000.00');
    expect(summary.approvedBillingCount).toBe(1);
  });
});
