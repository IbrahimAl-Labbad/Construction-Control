/**
 * tests/integration/billing-commitment-linkage.test.ts
 *
 * Phase 10.4: Subcontractor Billing Commitment Linkage Integration Tests on Live PostgreSQL.
 *
 * Enforces Architectural Invariants & Referential Integrity (AGENTS.md §6 & §15):
 * 1. Commitment must be APPROVED (DRAFT and REJECTED commitments reject creation with COMMITMENT_NOT_APPROVED).
 * 2. Commitment linkage: billing.projectId MUST equal commitment.projectId (rejects with INVALID_COMMITMENT_LINKAGE).
 * 3. Commitment linkage: billing.budgetLineId MUST equal commitment.budgetLineId (rejects with INVALID_COMMITMENT_LINKAGE).
 * 4. Subcontractor name must equal commitment.vendorName (rejects with SUBCONTRACTOR_NAME_MISMATCH).
 * 5. Approved commitment with matching linkage succeeds.
 * 6. Case-insensitive and trimmed vendor-name comparison succeeds and stores trimmed name.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  CommitmentStatus,
  SubcontractorBillingStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createBillingDraft,
} from '@/lib/subcontractor-billings';
import {
  createCommitmentDraft,
  submitCommitment,
  approveCommitment,
  rejectCommitment,
} from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing Commitment Linkage Integration (Live PostgreSQL)', () => {
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
          name: 'مدير ربط الالتزامات بالمستخلصات',
          email: `mgr.blink.${Date.now()}@test.local`,
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
          name: 'محاسب ربط الالتزامات بالمستخلصات',
          email: `acc.blink.${Date.now()}@test.local`,
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
          name: 'مسؤول مشتريات ربط الالتزامات',
          email: `pur.blink.${Date.now()}@test.local`,
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

  /** Sets up an active project with 2 budget lines and returns the project and lines */
  async function setupProjectWithLines() {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `LINK-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار قيود ربط الالتزامات بالمستخلصات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال مقاولات الهيكل الإنشائي',
          amount: '500000.00',
        },
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال مقاولات التشطيبات المعمارية',
          amount: '500000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const lines = await prisma.budgetLine.findMany({
      where: { budgetId: budgetDraft.id },
      orderBy: { description: 'asc' },
    });

    return {
      project,
      line1: lines[0]!,
      line2: lines[1]!,
    };
  }

  it('rejects creation when commitment is in DRAFT status with COMMITMENT_NOT_APPROVED', async () => {
    const { project, line1 } = await setupProjectWithLines();

    // Purchasing creates a commitment draft (remains DRAFT)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const draftCommitment = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: 'شركة الخرسانة الجاهزة',
      amount: '100000.00',
      commitmentDate: new Date(),
      description: 'أمر شراء مسودة غير معتمد',
    });
    cleanupCommitmentIds.push(draftCommitment.id);
    expect(draftCommitment.status).toBe(CommitmentStatus.DRAFT);

    // Accountant attempts to create billing linked to DRAFT commitment
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: line1.id,
        commitmentId: draftCommitment.id,
        subcontractorName: 'شركة الخرسانة الجاهزة',
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '50000.00',
        description: 'مطالبة على التزام مسودة',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'COMMITMENT_NOT_APPROVED',
      }),
    );
  });

  it('rejects creation when commitment is in REJECTED status with COMMITMENT_NOT_APPROVED', async () => {
    const { project, line1 } = await setupProjectWithLines();

    // Purchasing creates and submits commitment
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: 'مؤسسة المقاولات المرفوضة',
      amount: '100000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة مرفوض من الإدارة',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    // Manager rejects commitment
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    await rejectCommitment(commitmentDraft.id, {
      rejectionReason: 'السعر مبالغ فيه وتم رفض التعاقد',
    });

    const rejectedComm = await prisma.commitment.findUniqueOrThrow({
      where: { id: commitmentDraft.id },
    });
    expect(rejectedComm.status).toBe(CommitmentStatus.REJECTED);

    // Accountant attempts to create billing linked to REJECTED commitment
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: line1.id,
        commitmentId: commitmentDraft.id,
        subcontractorName: 'مؤسسة المقاولات المرفوضة',
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '30000.00',
        description: 'مطالبة على التزام مرفوض',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'COMMITMENT_NOT_APPROVED',
      }),
    );
  });

  it('rejects creation when billing.projectId != commitment.projectId with INVALID_COMMITMENT_LINKAGE', async () => {
    const setup1 = await setupProjectWithLines();
    const setup2 = await setupProjectWithLines();

    // Commitment belongs to Project 1
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: setup1.project.id,
      budgetLineId: setup1.line1.id,
      vendorName: 'شركة الأساسات المتحدة',
      amount: '200000.00',
      commitmentDate: new Date(),
      description: 'عقد خاص بمشروع 1',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    // Accountant attempts to link commitment of Project 1 to Project 2
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      createBillingDraft({
        projectId: setup2.project.id, // WRONG PROJECT!
        budgetLineId: setup2.line1.id,
        commitmentId: approvedComm.id,
        subcontractorName: 'شركة الأساسات المتحدة',
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '40000.00',
        description: 'محاولة ربط التزام من مشروع آخر',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'INVALID_COMMITMENT_LINKAGE',
      }),
    );
  });

  it('rejects creation when billing.budgetLineId != commitment.budgetLineId with INVALID_COMMITMENT_LINKAGE', async () => {
    const { project, line1, line2 } = await setupProjectWithLines();

    // Commitment belongs to line1
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: 'شركة توريد الخرسانة',
      amount: '150000.00',
      commitmentDate: new Date(),
      description: 'عقد تابع للبند الأول',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    // Accountant attempts to link commitment to line2
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: line2.id, // WRONG BUDGET LINE!
        commitmentId: approvedComm.id,
        subcontractorName: 'شركة توريد الخرسانة',
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '35000.00',
        description: 'محاولة ربط ببند موازنة مختلف',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'INVALID_COMMITMENT_LINKAGE',
      }),
    );
  });

  it('rejects creation when subcontractorName != commitment.vendorName with SUBCONTRACTOR_NAME_MISMATCH', async () => {
    const { project, line1 } = await setupProjectWithLines();

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: 'شركة أعمال العزل والتشطيبات',
      amount: '80000.00',
      commitmentDate: new Date(),
      description: 'عقد أعمال عزل معتمد',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    // Accountant attempts with completely different subcontractor name
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      createBillingDraft({
        projectId: project.id,
        budgetLineId: line1.id,
        commitmentId: approvedComm.id,
        subcontractorName: 'مؤسسة مقاولات أخرى غير مطابقة', // MISMATCH!
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '20000.00',
        description: 'اسم مقاول غير مطابق لاسم المورد بالعقد',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'SUBCONTRACTOR_NAME_MISMATCH',
      }),
    );
  });

  it('succeeds when commitment is APPROVED, linkage matches, and vendor name comparison is case-insensitive and trimmed', async () => {
    const { project, line1 } = await setupProjectWithLines();

    // Commitment created with leading/trailing whitespace and mixed case
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      vendorName: '  Al-Yamamah Contracting LLC  ',
      amount: '250000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولات باطن دولي',
      referenceNumber: 'PO-YAM-001',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    // Accountant provides name with different casing and whitespace
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      commitmentId: approvedComm.id,
      subcontractorName: '   al-yamamah contracting llc   ', // lowercase + whitespace
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '60000.00',
      description: 'مستخلص أول لأعمال مقاولة اليمامة',
    });
    cleanupBillingIds.push(billingDraft.id);

    expect(billingDraft.status).toBe(SubcontractorBillingStatus.DRAFT);
    expect(billingDraft.subcontractorName).toBe('al-yamamah contracting llc'); // Stored trimmed!
    expect(billingDraft.grossAmount).toBe('60000.00');
    expect(billingDraft.commitmentId).toBe(approvedComm.id);
    expect(billingDraft.projectId).toBe(project.id);
    expect(billingDraft.budgetLineId).toBe(line1.id);
  });
});
