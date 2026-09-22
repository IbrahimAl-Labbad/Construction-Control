/**
 * tests/integration/subcontractor-billing-lifecycle.test.ts
 *
 * Phase 10.1: Subcontractor Billing Lifecycle Integration Tests on Live PostgreSQL.
 *
 * Scenarios tested:
 * 1. Complete lifecycle: DRAFT → SUBMITTED → APPROVED
 *    - Validates final status, submittedById, submittedAt, approvedById, approvedAt.
 *    - Validates atomic SUBCONTRACTOR_BILLING_SUBMITTED and SUBCONTRACTOR_BILLING_APPROVED audit logs.
 * 2. Rejection flow: SUBMITTED → REJECTED → DRAFT
 *    - Validates rejectionReason, rejectedById, rejectedAt.
 *    - Reopening resets status to DRAFT, clears rejection & submission details.
 *    - Validates SUBCONTRACTOR_BILLING_REOPENED audit log.
 * 3. Cancellation flows:
 *    - DRAFT → CANCELLED
 *    - SUBMITTED → CANCELLED
 *    - Proves CANCELLED is a terminal state (cannot edit, cannot approve, cannot cancel again).
 * 4. Immutability guards:
 *    - APPROVED update fails with RECORD_NOT_EDITABLE.
 *    - APPROVED cancellation fails with CANNOT_CANCEL_APPROVED_BILLING.
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
  updateBillingDraft,
  submitBilling,
  approveBilling,
  rejectBilling,
  reopenBilling,
  cancelBilling,
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Subcontractor Billing Lifecycle Integration (Live PostgreSQL)', () => {
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
          name: 'مدير اختبار دورة المستخلصات',
          email: `mgr.bill.life.${Date.now()}@test.local`,
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
          name: 'محاسب اختبار دورة المستخلصات',
          email: `acc.bill.life.${Date.now()}@test.local`,
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
          name: 'مسؤول مشتريات دورة المستخلصات',
          email: `pur.bill.life.${Date.now()}@test.local`,
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

    // 1. Clean billings
    for (const bId of cleanupBillingIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: bId },
      });
      await prisma.subcontractorBilling.deleteMany({ where: { id: bId } });
    }
    cleanupBillingIds.length = 0;

    // 2. Clean commitments
    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'COMMITMENT', entityId: commId },
      });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    // 3. Clean projects and budgets
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

  /** Helper to seed an active project with an approved budget and approved commitment */
  async function setupProjectWithCommitment(params?: {
    budgetLineAmount?: string;
    commitmentAmount?: string;
    vendorName?: string;
  }) {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `BLIFE-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار دورة حياة مستخلصات مقاولي الباطن',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال الخرسانة والهيكل الإنشائي',
          amount: params?.budgetLineAmount ?? '1000000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // Purchasing creates and submits commitment
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: params?.vendorName ?? 'شركة المقاولات العامة المتطورة',
      amount: params?.commitmentAmount ?? '500000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لتنفيذ الهيكل الإنشائي',
      referenceNumber: 'SC-CTR-2026-001',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);

    await submitCommitment(commitmentDraft.id);

    // Manager approves commitment
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approvedCommitment = await approveCommitment(commitmentDraft.id);

    return {
      project,
      budgetLine,
      commitment: approvedCommitment,
    };
  }

  it('completes the entire lifecycle: DRAFT → SUBMITTED → APPROVED with strict audit and invariants', async () => {
    const { project, budgetLine, commitment } = await setupProjectWithCommitment();

    // 1. Accountant creates DRAFT
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
      referenceNumber: 'BILL-001',
      description: 'المستخلص الجاري رقم 1 عن أعمال صب القواعد',
    });
    cleanupBillingIds.push(draft.id);

    expect(draft.status).toBe(SubcontractorBillingStatus.DRAFT);
    expect(draft.createdById).toBe(testAccountant.id);
    expect(draft.submittedById).toBeNull();
    expect(draft.submittedAt).toBeNull();
    expect(draft.approvedById).toBeNull();
    expect(draft.approvedAt).toBeNull();

    // Verify DRAFT created audit
    const createAudit = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_CREATED', entityId: draft.id },
    });
    expect(createAudit).toBeDefined();
    expect(createAudit?.actorId).toBe(testAccountant.id);

    // 2. Accountant submits billing
    const submitted = await submitBilling(draft.id);

    expect(submitted.status).toBe(SubcontractorBillingStatus.SUBMITTED);
    expect(submitted.submittedById).toBe(testAccountant.id);
    expect(submitted.submittedAt).toBeDefined();

    // Verify SUBCONTRACTOR_BILLING_SUBMITTED audit
    const submitAudit = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_SUBMITTED', entityId: draft.id },
    });
    expect(submitAudit).toBeDefined();
    expect(submitAudit?.actorId).toBe(testAccountant.id);

    // 3. Manager approves billing
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveBilling(draft.id);

    expect(approved.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(approved.submittedById).toBe(testAccountant.id);
    expect(approved.submittedAt).toBeDefined();
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).toBeDefined();

    // Verify SUBCONTRACTOR_BILLING_APPROVED audit
    const approveAudit = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_APPROVED', entityId: draft.id },
    });
    expect(approveAudit).toBeDefined();
    expect(approveAudit?.actorId).toBe(testManager.id);

    // Verify DB state directly
    const dbRecord = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(dbRecord.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(dbRecord.submittedById).toBe(testAccountant.id);
    expect(dbRecord.approvedById).toBe(testManager.id);
    expect(dbRecord.grossAmount.toFixed(2)).toBe('150000.00');
  });

  it('handles rejection and reopen: SUBMITTED → REJECTED → DRAFT', async () => {
    const { project, budgetLine, commitment } = await setupProjectWithCommitment();

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
      grossAmount: '200000.00',
      description: 'مستخلص للمراجعة والتدقيق',
    });
    cleanupBillingIds.push(draft.id);

    await submitBilling(draft.id);

    // 2. Manager rejects the billing
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const rejected = await rejectBilling(draft.id, {
      rejectionReason: 'ملاحظات على نسب الإنجاز الميدانية وحسم كميات حديد غير مطابقة',
    });

    expect(rejected.status).toBe(SubcontractorBillingStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id);
    expect(rejected.rejectedAt).toBeDefined();
    expect(rejected.rejectionReason).toContain('ملاحظات على نسب الإنجاز');

    // Verify rejection audit log
    const rejectAudit = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_REJECTED', entityId: draft.id },
    });
    expect(rejectAudit).toBeDefined();

    // 3. Accountant reopens the rejected billing
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const reopened = await reopenBilling(draft.id);

    // Assert: reopened status = DRAFT
    expect(reopened.status).toBe(SubcontractorBillingStatus.DRAFT);
    // Assert: rejectionReason cleared
    expect(reopened.rejectionReason).toBeNull();
    // Assert: rejectedById cleared
    expect(reopened.rejectedById).toBeNull();
    // Assert: rejectedAt cleared
    expect(reopened.rejectedAt).toBeNull();
    // Assert: submitted details cleared
    expect(reopened.submittedById).toBeNull();
    expect(reopened.submittedAt).toBeNull();

    // Assert: REOPENED audit exists
    const reopenAudit = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_REOPENED', entityId: draft.id },
    });
    expect(reopenAudit).toBeDefined();
    expect(reopenAudit?.actorId).toBe(testAccountant.id);
  });

  it('handles cancellation from DRAFT → CANCELLED and SUBMITTED → CANCELLED, proving CANCELLED is terminal', async () => {
    const { project, budgetLine, commitment } = await setupProjectWithCommitment();

    // --- Flow A: DRAFT → CANCELLED ---
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draftA = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '50000.00',
      description: 'مسودة ملغاة مباشرة',
    });
    cleanupBillingIds.push(draftA.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    const cancelledA = await cancelBilling(draftA.id, {
      cancellationReason: 'إلغاء المسودة بناء على طلب إدارة المشروع',
    });

    expect(cancelledA.status).toBe(SubcontractorBillingStatus.CANCELLED);

    const cancelAuditA = await prisma.auditLog.findFirst({
      where: { action: 'SUBCONTRACTOR_BILLING_CANCELLED', entityId: draftA.id },
    });
    expect(cancelAuditA).toBeDefined();

    // --- Flow B: SUBMITTED → CANCELLED ---
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    const draftB = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '75000.00',
      description: 'مستخلص مقدم سيتم إلغاؤه',
    });
    cleanupBillingIds.push(draftB.id);

    await submitBilling(draftB.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    const cancelledB = await cancelBilling(draftB.id, {
      cancellationReason: 'إلغاء المستخلص بعد التقديم لاكتشاف خطأ بالمرفقات',
    });

    expect(cancelledB.status).toBe(SubcontractorBillingStatus.CANCELLED);

    // --- Assert: CANCELLED is a terminal state ---
    // 1. Cannot update cancelled billing
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    await expect(
      updateBillingDraft(cancelledB.id, {
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '75000.00',
        description: 'محاولة تعديل مستخلص ملغى',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RECORD_NOT_EDITABLE' }));

    // 2. Cannot approve cancelled billing
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await expect(approveBilling(cancelledB.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );

    // 3. Cannot cancel an already cancelled billing
    await expect(cancelBilling(cancelledB.id)).rejects.toThrow(
      expect.objectContaining({ code: 'BILLING_ALREADY_CANCELLED' }),
    );
  });

  it('enforces immutability: APPROVED update fails with RECORD_NOT_EDITABLE and cancellation fails with CANNOT_CANCEL_APPROVED_BILLING', async () => {
    const { project, budgetLine, commitment } = await setupProjectWithCommitment();

    // 1. Create, submit, and approve billing
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const draft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '120000.00',
      description: 'مستخلص معتمد لاختبار عدم القابلية للتغيير',
    });
    cleanupBillingIds.push(draft.id);

    await submitBilling(draft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveBilling(draft.id);
    expect(approved.status).toBe(SubcontractorBillingStatus.APPROVED);

    // 2. Immutability: update must fail with RECORD_NOT_EDITABLE
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    await expect(
      updateBillingDraft(draft.id, {
        subcontractorName: commitment.vendorName,
        billingPeriod: '2026-03',
        claimDate: new Date('2026-03-15'),
        grossAmount: '120000.00',
        description: 'محاولة تعديل مستخلص معتمد غير مسموح به',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RECORD_NOT_EDITABLE' }));

    // 3. Immutability: cancellation must fail with CANNOT_CANCEL_APPROVED_BILLING
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    await expect(cancelBilling(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'CANNOT_CANCEL_APPROVED_BILLING' }),
    );

    // Verify DB record remains pristine
    const finalDb = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(finalDb.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(finalDb.grossAmount.toFixed(2)).toBe('120000.00');
  });
});
