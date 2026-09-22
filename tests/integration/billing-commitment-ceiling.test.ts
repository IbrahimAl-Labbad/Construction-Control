/**
 * tests/integration/billing-commitment-ceiling.test.ts
 *
 * Phase 10.2: Billing Commitment Ceiling Integration Tests on Live PostgreSQL.
 *
 * Enforces Hard Financial Invariant (AGENTS.md §13):
 * 1. Seed Commitment.amount = 500,000.00 SAR.
 * 2. Approve Billing A = 300,000.00 SAR (Success).
 * 3. Attempt to approve Billing B = 250,000.00 SAR (Rejects with COMMITMENT_CEILING_EXCEEDED).
 *    - Assert cumulativeCertified in DB = 300,000.00 SAR, NOT 550,000.00 SAR.
 * 4. Approve Billing C = 200,000.00 SAR (Success: 300k + 200k = 500k, exact ceiling match).
 * 5. Final DB assertion:
 *    - SUM(APPROVED billing.grossAmount) = 500,000.00 SAR.
 *    - Commitment.amount = 500,000.00 SAR.
 *    - Billing B remains in SUBMITTED state.
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
  calculateCumulativeCertified,
  getCommitmentBillings,
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing Commitment Ceiling Integration (Live PostgreSQL)', () => {
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
          name: 'مدير سقف التزامات المستخلصات',
          email: `mgr.bceiling.${Date.now()}@test.local`,
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
          name: 'محاسب سقف التزامات المستخلصات',
          email: `acc.bceiling.${Date.now()}@test.local`,
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
          name: 'مسؤول مشتريات سقف الالتزامات',
          email: `pur.bceiling.${Date.now()}@test.local`,
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

  it('strictly enforces commitment ceiling: approves A (300k), rejects B (250k), then approves C (200k) up to exactly 500k', async () => {
    // -------------------------------------------------------------------------
    // 1. Setup: Active Project + Approved Budget + Commitment = 500,000.00 SAR
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `CEIL-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار سقف التزامات المستخلصات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال المقاولات الإنشائية الكبرى',
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

    // Purchasing creates and submits Commitment of 500,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة المقاولون العرب للإنشاءات',
      amount: '500000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لأعمال الأساسات والهيكل',
      referenceNumber: 'PO-CEIL-500K',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);

    await submitCommitment(commitmentDraft.id);

    // Manager approves commitment
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const commitment = await approveCommitment(commitmentDraft.id);
    expect(commitment.amount).toBe('500000.00');

    // -------------------------------------------------------------------------
    // 2. Accountant creates 3 SUBMITTED billings:
    //    Billing A = 300,000.00 SAR
    //    Billing B = 250,000.00 SAR
    //    Billing C = 200,000.00 SAR
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
      description: 'مستخلص دفعة أولى 300 ألف',
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
      grossAmount: '250000.00',
      description: 'مستخلص دفعة ثانية 250 ألف (يتجاوز السقف)',
    });
    cleanupBillingIds.push(billingDraftB.id);
    await submitBilling(billingDraftB.id);

    const billingDraftC = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-31'),
      grossAmount: '200000.00',
      description: 'مستخلص دفعة ثالثة 200 ألف (يستوفي السقف بالضبط)',
    });
    cleanupBillingIds.push(billingDraftC.id);
    await submitBilling(billingDraftC.id);

    // -------------------------------------------------------------------------
    // 3. Approve Billing A = 300,000.00 SAR
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approvedA = await approveBilling(billingDraftA.id);
    expect(approvedA.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(approvedA.grossAmount).toBe('300000.00');

    // Verify cumulative certified after Billing A via getCommitmentBillings
    let summary = await getCommitmentBillings(commitment.id);
    expect(summary.cumulativeCertified).toBe('300000.00');
    expect(summary.remainingCommitmentBalance).toBe('200000.00');

    // -------------------------------------------------------------------------
    // 4. Attempt to approve Billing B = 250,000.00 SAR
    //    Expected: COMMITMENT_CEILING_EXCEEDED
    // -------------------------------------------------------------------------
    await expect(approveBilling(billingDraftB.id)).rejects.toThrow(
      expect.objectContaining({
        code: 'COMMITMENT_CEILING_EXCEEDED',
      }),
    );

    // Assert: Billing B remains SUBMITTED in DB
    const dbBillingB = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: billingDraftB.id },
    });
    expect(dbBillingB.status).toBe(SubcontractorBillingStatus.SUBMITTED);
    expect(dbBillingB.approvedById).toBeNull();
    expect(dbBillingB.approvedAt).toBeNull();

    // Assert: cumulativeCertified in DB = 300,000.00 SAR (NOT 550,000.00 SAR)
    summary = await getCommitmentBillings(commitment.id);
    expect(summary.cumulativeCertified).toBe('300000.00');
    expect(summary.cumulativeCertified).not.toBe('550000.00');
    expect(summary.remainingCommitmentBalance).toBe('200000.00');

    // Also assert direct database aggregate
    const dbAggAfterB = await prisma.subcontractorBilling.aggregate({
      where: {
        commitmentId: commitment.id,
        status: SubcontractorBillingStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { grossAmount: true },
    });
    const cumulativeDbAfterB = dbAggAfterB._sum.grossAmount ?? new Prisma.Decimal('0.00');
    expect(cumulativeDbAfterB.toFixed(2)).toBe('300000.00');
    expect(cumulativeDbAfterB.toFixed(2)).not.toBe('550000.00');

    // -------------------------------------------------------------------------
    // 5. Then approve Billing C = 200,000.00 SAR
    //    Expected: 300,000 + 200,000 = 500,000.00 SAR (Success)
    // -------------------------------------------------------------------------
    const approvedC = await approveBilling(billingDraftC.id);
    expect(approvedC.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(approvedC.grossAmount).toBe('200000.00');

    // -------------------------------------------------------------------------
    // 6. Final DB Assertions
    // -------------------------------------------------------------------------
    const allApprovedBillings = await prisma.subcontractorBilling.findMany({
      where: {
        commitmentId: commitment.id,
        status: SubcontractorBillingStatus.APPROVED,
        deletedAt: null,
      },
    });

    expect(allApprovedBillings.length).toBe(2); // Billing A and Billing C

    const sumApprovedGross = allApprovedBillings.reduce(
      (sum, b) => sum.add(b.grossAmount),
      new Prisma.Decimal('0.00'),
    );

    // SUM(APPROVED billing.grossAmount) = 500,000.00 SAR
    expect(sumApprovedGross.toFixed(2)).toBe('500000.00');

    // Commitment.amount = 500,000.00 SAR
    const dbCommitment = await prisma.commitment.findUniqueOrThrow({
      where: { id: commitment.id },
    });
    expect(dbCommitment.amount.toFixed(2)).toBe('500000.00');
    expect(sumApprovedGross.equals(dbCommitment.amount)).toBe(true);

    // Remaining balance is exactly 0.00 SAR
    const finalSummary = await getCommitmentBillings(commitment.id);
    expect(finalSummary.cumulativeCertified).toBe('500000.00');
    expect(finalSummary.remainingCommitmentBalance).toBe('0.00');

    // Verify pure calculation function
    const pureResult = calculateCumulativeCertified(dbCommitment.amount, allApprovedBillings);
    expect(pureResult.cumulativeCertified.toFixed(2)).toBe('500000.00');
    expect(pureResult.remainingCommitmentBalance.toFixed(2)).toBe('0.00');
  });
});
