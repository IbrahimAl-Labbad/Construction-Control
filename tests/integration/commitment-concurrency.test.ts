/**
 * tests/integration/commitment-concurrency.test.ts
 *
 * Concurrency integration tests on live PostgreSQL (Commitment vs Commitment):
 * Proves Assertion A & Financial Concurrency Invariant:
 * 1. Seeds an active project with an approved budget line of 10,000.00 SAR.
 * 2. Seeds two SUBMITTED commitments on this line for 8,000.00 SAR each (Total = 16,000.00 SAR).
 * 3. Dispatches two genuinely concurrent approveCommitment transactions in parallel using Promise.allSettled.
 * 4. Proves PostgreSQL row-level locking (SELECT ... FOR UPDATE) serializes the approvals.
 * 5. Proves exactly one approval succeeds and the second fails with BUDGET_LINE_EXCEEDED.
 * 6. Independently queries PostgreSQL after the race condition and proves:
 *    SUM(APPROVED commitments) <= BudgetLine.amount (strictly 8,000.00 SAR).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, CommitmentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createCommitmentDraft,
  updateCommitmentDraft,
  submitCommitment,
  approveCommitment,
  rejectCommitment,
} from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Commitment Concurrency & Overcommit Prevention (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير سباق الالتزامات',
          email: `mgr.comm.race.${Date.now()}@test.local`,
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

    // 2. Purchasing Officer (Submitter)
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول سباق الالتزامات',
          email: `pur.comm.race.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: commId } });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
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

  it('proves BudgetLine FOR UPDATE lock prevents overcommitting under concurrent approvals', async () => {
    // 1. Setup Active Project with Approved Budget
    const project = await createProject({
      code: `CONC-COMM-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن الالتزامات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    // Line ceiling = exactly 10,000.00 SAR
    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'توريد أسمنت بورتلاندي',
          amount: '10000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // 2. Seed TWO submitted commitments of 8,000.00 SAR each (Total = 16,000.00 SAR > 10,000.00 SAR)
    const commA = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('8000.00'),
        currency: 'SAR',
        vendorName: 'شركة أسمنت اليمامة',
        referenceNumber: 'PO-CEMENT-01',
        description: 'دفعة أسمنت أولى',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commA.id);

    const commB = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('8000.00'),
        currency: 'SAR',
        vendorName: 'شركة أسمنت الرياض',
        referenceNumber: 'PO-CEMENT-02',
        description: 'دفعة أسمنت ثانية',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commB.id);

    // 3. Dispatch genuinely concurrent approvals in parallel
    const [resultA, resultB] = await Promise.allSettled([
      approveCommitment(commA.id),
      approveCommitment(commB.id),
    ]);

    // 4. Prove: Exactly one succeeded and one failed with BUDGET_LINE_EXCEEDED
    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 5. Independently query live PostgreSQL to prove final DB state
    const dbCommitments = await prisma.commitment.findMany({
      where: { budgetLineId: budgetLine.id, deletedAt: null },
    });

    const approvedCommitments = dbCommitments.filter((c) => c.status === CommitmentStatus.APPROVED);
    expect(approvedCommitments.length).toBe(1);

    const totalApprovedExposure = approvedCommitments.reduce(
      (sum, c) => sum.add(c.amount),
      new Prisma.Decimal('0.00'),
    );

    // CRITICAL FINANCIAL PROOF: total approved commitments <= budgetLine.amount
    expect(totalApprovedExposure.toNumber()).toBe(8000.0);
    expect(totalApprovedExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);

    const nonApproved = dbCommitments.filter((c) => c.status !== CommitmentStatus.APPROVED);
    expect(nonApproved.length).toBe(1);
    expect(nonApproved[0]?.status).toBe(CommitmentStatus.SUBMITTED); // Remains submitted, not approved!
  });

  it('serializes concurrent updateCommitmentDraft and submitCommitment without silent overwrite or stale state', async () => {
    const project = await createProject({
      code: `CONC-US-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن التعديل والتقديم للالتزامات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد أول',
          amount: '50000.00',
        },
        {
          category: BudgetCategory.EQUIPMENT,
          description: 'بند معدات ثاني',
          amount: '50000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const lines = await prisma.budgetLine.findMany({
      where: { budgetId: budgetDraft.id },
      orderBy: { category: 'asc' },
    });
    const line1 = lines[0]!;
    const line2 = lines[1]!;

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const draft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: 'شركة التوريدات الأولى',
      referenceNumber: 'PO-RACE-US-1',
      amount: '10000.00',
      commitmentDate: new Date(),
      description: 'مسودة التزام قبل التعديل المتزامن',
    });
    cleanupCommitmentIds.push(draft.id);

    // Dispatch concurrent updateCommitmentDraft (switching to line2 and 25,000.00) and submitCommitment
    const [updateRes, submitRes] = await Promise.allSettled([
      updateCommitmentDraft(draft.id, {
        budgetLineId: line2.id,
        vendorName: 'شركة التوريدات المعدلة',
        referenceNumber: 'PO-RACE-US-2',
        amount: '25000.00',
        commitmentDate: new Date(),
        description: 'مسودة التزام بعد التعديل المتزامن',
      }),
      submitCommitment(draft.id),
    ]);

    const finalRecord = await prisma.commitment.findUniqueOrThrow({
      where: { id: draft.id },
    });
    const submitAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'COMMITMENT', entityId: draft.id, action: 'COMMITMENT_SUBMITTED' },
      orderBy: { createdAt: 'desc' },
    });

    // Either:
    // Case 1: updateCommitmentDraft acquired lock first -> updated to 25000/line2, then submitCommitment succeeded and logged 25000/line2.
    // Case 2: submitCommitment acquired lock first -> transitioned to SUBMITTED with 10000/line1, and updateCommitmentDraft failed with COMMITMENT_NOT_DRAFT.
    expect(submitRes.status).toBe('fulfilled');
    expect(finalRecord.status).toBe(CommitmentStatus.SUBMITTED);
    expect(submitAudit).toBeDefined();

    const auditMeta = submitAudit?.metadata as Record<string, unknown>;
    if (updateRes.status === 'fulfilled') {
      expect(finalRecord.amount.toFixed(2)).toBe('25000.00');
      expect(finalRecord.budgetLineId).toBe(line2.id);
      expect(auditMeta.amount).toBe('25000.00');
      expect(auditMeta.budgetLineId).toBe(line2.id);
    } else {
      expect((updateRes.reason as { code?: string }).code).toBe('COMMITMENT_NOT_DRAFT');
      expect(finalRecord.amount.toFixed(2)).toBe('10000.00');
      expect(finalRecord.budgetLineId).toBe(line1.id);
      expect(auditMeta.amount).toBe('10000.00');
      expect(auditMeta.budgetLineId).toBe(line1.id);
    }
  });

  it('prevents duplicate approvals when two simultaneous approveCommitment calls target the same commitment', async () => {
    const project = await createProject({
      code: `CONC-DUP-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع منع الاعتماد المزدوج لنفس الالتزام',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند حديد تسليح',
          amount: '100000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    const comm = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('15000.00'),
        currency: 'SAR',
        vendorName: 'مؤسسة التوريد الموحد',
        referenceNumber: 'PO-DUP-01',
        description: 'التزام لاختبار الاعتماد المزدوج',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(comm.id);

    const [res1, res2] = await Promise.allSettled([
      approveCommitment(comm.id),
      approveCommitment(comm.id),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('INVALID_STATE_TRANSITION');

    const approveLogs = await prisma.auditLog.findMany({
      where: { entityType: 'COMMITMENT', entityId: comm.id, action: 'COMMITMENT_APPROVED' },
    });
    expect(approveLogs.length).toBe(1);
  });

  it('serializes concurrent approveCommitment and rejectCommitment on the same commitment', async () => {
    const project = await createProject({
      code: `CONC-AR-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع تزامن الاعتماد والرفض للالتزام',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد كهربائية',
          amount: '100000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    const comm = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('12000.00'),
        currency: 'SAR',
        vendorName: 'شركة الكابلات الوطنية',
        referenceNumber: 'PO-AR-01',
        description: 'التزام لاختبار سباق الاعتماد والرفض',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(comm.id);

    const [approveRes, rejectRes] = await Promise.allSettled([
      approveCommitment(comm.id),
      rejectCommitment(comm.id, { rejectionReason: 'رفض متزامن مع الاعتماد لاختبار القفل' }),
    ]);

    const fulfilled = [approveRes, rejectRes].filter((r) => r.status === 'fulfilled');
    const rejected = [approveRes, rejectRes].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('INVALID_STATE_TRANSITION');

    const finalComm = await prisma.commitment.findUniqueOrThrow({ where: { id: comm.id } });
    if (approveRes.status === 'fulfilled') {
      expect(finalComm.status).toBe(CommitmentStatus.APPROVED);
    } else {
      expect(finalComm.status).toBe(CommitmentStatus.REJECTED);
    }
  });
});
