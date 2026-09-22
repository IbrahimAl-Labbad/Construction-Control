/**
 * tests/integration/billing-audit-atomicity.test.ts
 *
 * Phase 10.5: Subcontractor Billing Audit Atomicity Integration Tests on Live PostgreSQL.
 *
 * Enforces AGENTS.md §21 (Auditability Requirements) & §15 (Database Safety & Transactions):
 * 1. Failure Path:
 *    - Force approval to fail due to commitment ceiling (grossAmount > remainingCommitmentBalance).
 *    - Assert billing remains in SUBMITTED state.
 *    - Assert no APPROVED state is persisted.
 *    - Assert NO SUBCONTRACTOR_BILLING_APPROVED AuditLog is created in PostgreSQL.
 * 2. Success Path:
 *    - Approve a valid billing claim within commitment ceiling.
 *    - Assert billing status = APPROVED in PostgreSQL.
 *    - Assert EXACTLY ONE SUBCONTRACTOR_BILLING_APPROVED AuditLog exists for this billing.
 *    - Assert audit log metadata contains:
 *      - grossAmount
 *      - previousCumulativeCertified
 *      - newCumulativeCertified
 *      - remainingCommitmentBalance
 *      - approvedAt
 * 3. Proves atomic transaction boundaries: all mutations and audit logs succeed together or roll back together.
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
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing Audit Atomicity Integration (Live PostgreSQL)', () => {
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
          name: 'مدير ذرية التدقيق للمستخلصات',
          email: `mgr.baudit.${Date.now()}@test.local`,
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
          name: 'محاسب ذرية التدقيق للمستخلصات',
          email: `acc.baudit.${Date.now()}@test.local`,
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
          name: 'مسؤول مشتريات ذرية التدقيق',
          email: `pur.baudit.${Date.now()}@test.local`,
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
  async function setupProject(commitmentAmount: string = '200000.00') {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `ATOM-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار ذرية سجل التدقيق',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال المقاولات الشاملة',
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
      vendorName: 'شركة المقاولات الذرية',
      amount: commitmentAmount,
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لاختبار الذرية',
      referenceNumber: 'PO-ATOM-01',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    return { project, budgetLine, commitment: approvedComm };
  }

  it('failure path: when approval fails due to commitment ceiling, billing remains SUBMITTED and no SUBCONTRACTOR_BILLING_APPROVED audit log is created', async () => {
    // 1. Seed Commitment = 200,000.00 SAR
    const { project, budgetLine, commitment } = await setupProject('200000.00');

    // 2. Accountant creates and submits Billing = 250,000.00 SAR (exceeds 200k ceiling)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '250000.00',
      description: 'مستخلص يتجاوز السقف لاختبار الذرية عند الفشل',
    });
    cleanupBillingIds.push(draft.id);

    await submitBilling(draft.id);

    // Record audit count before approval attempt
    const auditsBefore = await prisma.auditLog.findMany({
      where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: draft.id },
    });
    expect(auditsBefore.length).toBe(2); // CREATED and SUBMITTED

    // 3. Manager attempts approval -> throws COMMITMENT_CEILING_EXCEEDED
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    await expect(approveBilling(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'COMMITMENT_CEILING_EXCEEDED' }),
    );

    // 4. Assert DB state after failure:
    // - billing remains SUBMITTED
    // - approvedById / approvedAt are null
    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbBilling.status).toBe(SubcontractorBillingStatus.SUBMITTED);
    expect(dbBilling.approvedById).toBeNull();
    expect(dbBilling.approvedAt).toBeNull();

    // - no SUBCONTRACTOR_BILLING_APPROVED AuditLog was created
    const approveAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: draft.id,
        action: 'SUBCONTRACTOR_BILLING_APPROVED',
      },
    });
    expect(approveAudit).toBeNull();

    // Total audits for this billing unchanged
    const auditsAfter = await prisma.auditLog.findMany({
      where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: draft.id },
    });
    expect(auditsAfter.length).toBe(2);
  });

  it('success path: when approval succeeds, billing is APPROVED and exactly one SUBCONTRACTOR_BILLING_APPROVED audit log is created with exact metadata', async () => {
    // 1. Seed Commitment = 300,000.00 SAR
    const { project, budgetLine, commitment } = await setupProject('300000.00');

    // 2. Accountant creates and submits Billing = 150,000.00 SAR
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '150000.00',
      description: 'مستخلص مقبول لاختبار الذرية عند النجاح',
    });
    cleanupBillingIds.push(draft.id);

    await submitBilling(draft.id);

    // 3. Manager approves billing successfully
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveBilling(draft.id);

    // 4. Assert: billing = APPROVED in database
    expect(approved.status).toBe(SubcontractorBillingStatus.APPROVED);

    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbBilling.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(dbBilling.approvedById).toBe(testManager.id);
    expect(dbBilling.approvedAt).toBeDefined();

    // 5. Assert: exactly one approval audit exists
    const approvalAudits = await prisma.auditLog.findMany({
      where: {
        entityType: 'SUBCONTRACTOR_BILLING',
        entityId: draft.id,
        action: 'SUBCONTRACTOR_BILLING_APPROVED',
      },
    });
    expect(approvalAudits.length).toBe(1);

    const audit = approvalAudits[0]!;
    expect(audit.actorId).toBe(testManager.id);

    // Assert metadata fields:
    // grossAmount, previousCumulativeCertified, newCumulativeCertified, remainingCommitmentBalance, approvedAt
    const metadata = audit.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata['grossAmount']).toBe('150000.00');
    expect(metadata['previousCumulativeCertified']).toBe('0.00');
    expect(metadata['newCumulativeCertified']).toBe('150000.00');
    expect(metadata['remainingCommitmentBalance']).toBe('150000.00'); // 300,000 - 150,000 = 150,000
    expect(metadata['approvedAt']).toBeDefined();
    expect(typeof metadata['approvedAt']).toBe('string');
  });
});
