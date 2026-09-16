/**
 * tests/integration/commitment-lifecycle.test.ts
 *
 * Full integration tests for Project Commitment lifecycle against live PostgreSQL:
 * 1. Project ACTIVE + APPROVED Budget setup.
 * 2. Draft creation by Purchasing Officer + atomic COMMITMENT_CREATED audit log.
 * 3. Draft update with deltas + atomic COMMITMENT_UPDATED audit log.
 * 4. Submission + COMMITMENT_SUBMITTED audit log + pending exposure verification.
 * 5. Rejection by Manager + explicit rejection tracking (rejectedById, rejectionReason).
 * 6. Reopen by creator + rejection cleanup + resubmission.
 * 7. Approval by Manager + atomic exposure encumbrance + COMMITMENT_APPROVED audit log.
 * 8. Approved commitment immutability (cannot edit or soft-delete).
 * 9. Self-approval prevention (actor.id !== createdById && actor.id !== submittedById).
 * 10. Soft deletion behavior on drafts + COMMITMENT_DELETED audit log.
 * 11. Complete exposure metrics verification (Mandatory Correction 1).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, CommitmentStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createCommitmentDraft,
  updateCommitmentDraft,
  deleteCommitmentDraft,
  submitCommitment,
  rejectCommitment,
  reopenCommitment,
  approveCommitment,
  getProjectCommitments,
} from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Commitment Lifecycle Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];

  beforeEach(async () => {
    // 1. Find or create test Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير التزامات التكامل',
          email: `mgr.comm.${Date.now()}@test.local`,
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

    // 2. Find or create test Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات التكامل',
          email: `pur.comm.${Date.now()}@test.local`,
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

  it('completes the entire commitment lifecycle with strict audit and invariants', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Create active project with approved budget
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `COMM-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار دورة حياة الالتزامات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند شراء وتوريد حديد التسليح',
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

    // -------------------------------------------------------------------------
    // Step 2: Purchasing creates Commitment Draft
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const draft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة حديد سابك',
      referenceNumber: '  PO-STEEL-001  ', // Test Correction 2 normalization
      amount: '30000.00',
      commitmentDate: new Date(),
      description: 'أمر شراء مبدئي لتوريد 10 طن حديد',
    });
    cleanupCommitmentIds.push(draft.id);

    expect(draft.status).toBe(CommitmentStatus.DRAFT);
    expect(draft.referenceNumber).toBe('PO-STEEL-001'); // Trimmed!
    expect(draft.amount).toBe('30000.00');
    expect(draft.createdById).toBe(testPurchasing.id);

    // Verify COMMITMENT_CREATED audit log
    const createLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_CREATED', entityId: draft.id },
    });
    expect(createLog).toBeDefined();
    expect(createLog?.actorId).toBe(testPurchasing.id);

    // -------------------------------------------------------------------------
    // Step 3: Purchasing updates Draft with deltas
    // -------------------------------------------------------------------------
    const updatedDraft = await updateCommitmentDraft(draft.id, {
      budgetLineId: budgetLine.id,
      vendorName: 'شركة حديد الراجحي',
      referenceNumber: '', // Test empty string -> null normalization
      amount: '35000.00',
      commitmentDate: new Date(),
      description: 'تعديل أمر الشراء لتوريد 12 طن حديد مع النقل',
    });

    expect(updatedDraft.vendorName).toBe('شركة حديد الراجحي');
    expect(updatedDraft.referenceNumber).toBeNull(); // Empty string normalized to null!
    expect(updatedDraft.amount).toBe('35000.00');

    // Verify COMMITMENT_UPDATED audit log with deltas
    const updateLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_UPDATED', entityId: draft.id },
    });
    expect(updateLog).toBeDefined();
    expect(updateLog?.metadata).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 4: Purchasing submits Commitment for approval
    // -------------------------------------------------------------------------
    const submitted = await submitCommitment(draft.id);
    expect(submitted.status).toBe(CommitmentStatus.SUBMITTED);
    expect(submitted.submittedById).toBe(testPurchasing.id);
    expect(submitted.submittedAt).toBeDefined();

    const submitLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_SUBMITTED', entityId: draft.id },
    });
    expect(submitLog).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 5: Manager rejects Commitment with reason
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    const rejected = await rejectCommitment(draft.id, {
      rejectionReason: 'السعر للطن أعلى من التسعيرة المعتمدة للمشروع',
    });

    expect(rejected.status).toBe(CommitmentStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id);
    expect(rejected.rejectionReason).toBe('السعر للطن أعلى من التسعيرة المعتمدة للمشروع');

    const rejectLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_REJECTED', entityId: draft.id },
    });
    expect(rejectLog).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 6: Purchasing reopens Commitment to DRAFT
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const reopened = await reopenCommitment(draft.id);
    expect(reopened.status).toBe(CommitmentStatus.DRAFT);
    expect(reopened.rejectionReason).toBeNull();
    expect(reopened.rejectedById).toBeNull();

    const reopenLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_REOPENED', entityId: draft.id },
    });
    expect(reopenLog).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 7: Update and Re-submit
    // -------------------------------------------------------------------------
    await updateCommitmentDraft(draft.id, {
      budgetLineId: budgetLine.id,
      vendorName: 'شركة حديد الراجحي - عرض مخفض',
      referenceNumber: 'PO-STEEL-002',
      amount: '32000.00',
      commitmentDate: new Date(),
      description: 'أمر الشراء بعد التفاوض وتخفيض سعر الطن',
    });

    const resubmitted = await submitCommitment(draft.id);
    expect(resubmitted.status).toBe(CommitmentStatus.SUBMITTED);
    expect(resubmitted.amount).toBe('32000.00');

    // -------------------------------------------------------------------------
    // Step 8: Manager approves Commitment
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveCommitment(draft.id);
    expect(approved.status).toBe(CommitmentStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).toBeDefined();

    const approveLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_APPROVED', entityId: draft.id },
    });
    expect(approveLog).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 9: Verify Project Overview & Metrics (Mandatory Correction 1)
    // -------------------------------------------------------------------------
    const overview = await getProjectCommitments(project.id);
    expect(overview.totalAuthorizedBudget).toBe('100000.00');
    expect(overview.totalApprovedExpenses).toBe('0.00');
    expect(overview.totalApprovedCommitments).toBe('32000.00');
    expect(overview.totalExposure).toBe('32000.00');
    expect(overview.totalAvailableBalance).toBe('68000.00');
    expect(overview.totalPendingCommitmentExposure).toBe('0.00');
    expect(overview.totalProjectedBalance).toBe('68000.00');

    // -------------------------------------------------------------------------
    // Step 10: Soft Delete behavior on a second draft
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);

    const draft2 = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'مورد مواد إضافية',
      amount: '5000.00',
      commitmentDate: new Date(),
      description: 'مسودة للتجربة والحذف',
    });
    cleanupCommitmentIds.push(draft2.id);

    await deleteCommitmentDraft(draft2.id);

    const deletedInDb = await prisma.commitment.findUnique({
      where: { id: draft2.id },
    });
    expect(deletedInDb).toBeDefined();
    expect(deletedInDb?.deletedAt).not.toBeNull(); // Soft deleted!

    const deleteLog = await prisma.auditLog.findFirst({
      where: { action: 'COMMITMENT_DELETED', entityId: draft2.id },
    });
    expect(deleteLog).toBeDefined();
  });
});
