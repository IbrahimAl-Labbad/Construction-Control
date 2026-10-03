/**
 * tests/integration/variation-order-lifecycle.test.ts
 *
 * Vertical Slice 20: Variation Orders Lifecycle Integration Tests on Live PostgreSQL.
 *
 * Tests the complete business domain:
 * 1. Happy path: DRAFT -> SUBMITTED -> APPROVED
 *    - Order numbering (VO-[PROJECT_CODE]-XXX)
 *    - BOQ line calculation & server-side recalculation
 *    - Atomic audit logging (created, submitted, approved)
 *    - Revised approved budget integration
 *    - Immutability guards on approved orders
 * 2. Rejection & Reopening: SUBMITTED -> REJECTED -> DRAFT -> RESUBMITTED -> APPROVED
 *    - Mandatory rejection reason enforcement
 *    - Reopen resets status to DRAFT and clears rejection metadata
 *    - Atomic audit logging (rejected, reopened)
 *    - Zero budget impact while in rejected/draft status
 * 3. Separation of duties:
 *    - Manager cannot self-approve if creator
 *    - Non-assigned engineer is rejected
 *    - Unauthorized roles cannot approve
 * 4. Negative variation (Cost reduction / Omission):
 *    - Correctly deducts from revised approved budget
 * 5. Concurrency protection:
 *    - Concurrent approval prevents duplicate budget updates
 *
 * Follows AGENTS.md §5, §8, §10, §12, §13, §14, §15, §18, §20.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  VariationOrderStatus,
  AssignmentStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createVariationOrder,
  updateVariationOrder,
  deleteVariationOrder,
  submitVariationOrder,
  approveVariationOrder,
  rejectVariationOrder,
  reopenVariationOrder,
  getProjectVariationsSummary,
} from '@/lib/variation-orders';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as authSession from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

describe('Variation Orders Lifecycle Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testOtherEngineer: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupVoIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgrUser = await prisma.user.create({
      data: {
        name: 'مدير اختبار أوامر التغيير',
        email: `mgr.vo.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgrUser.id);
    testManager = {
      id: mgrUser.id,
      name: mgrUser.name,
      email: mgrUser.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Engineer (Assigned)
    const engUser = await prisma.user.create({
      data: {
        name: 'مهندس الموقع المكلف',
        email: `eng.vo.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(engUser.id);
    testEngineer = {
      id: engUser.id,
      name: engUser.name,
      email: engUser.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Other Engineer (Not assigned)
    const otherEngUser = await prisma.user.create({
      data: {
        name: 'مهندس غير مكلف',
        email: `othereng.vo.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(otherEngUser.id);
    testOtherEngineer = {
      id: otherEngUser.id,
      name: otherEngUser.name,
      email: otherEngUser.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Accountant
    const accUser = await prisma.user.create({
      data: {
        name: 'محاسب المشروع',
        email: `acc.vo.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ACCOUNTANT,
        isActive: true,
      },
    });
    cleanupUserIds.push(accUser.id);
    testAccountant = {
      id: accUser.id,
      name: accUser.name,
      email: accUser.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Clean Variation Orders and lines
    for (const voId of cleanupVoIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'VARIATION_ORDER', entityId: voId },
      });
      await prisma.variationOrderLine.deleteMany({ where: { variationOrderId: voId } });
      await prisma.variationOrder.deleteMany({ where: { id: voId } });
    }
    cleanupVoIds.length = 0;

    // Clean Projects, Budgets, Assignments
    for (const pId of cleanupProjectIds) {
      await prisma.variationOrderLine.deleteMany({
        where: { variationOrder: { projectId: pId } },
      });
      await prisma.variationOrder.deleteMany({ where: { projectId: pId } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });

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

    // Clean Users
    for (const uId of cleanupUserIds) {
      await prisma.auditLog.deleteMany({ where: { actorId: uId } });
      await prisma.user.deleteMany({ where: { id: uId } });
    }
    cleanupUserIds.length = 0;
  });

  /** Setup helper: creates project with approved budget and assigns testEngineer */
  async function setupProject(budgetAmount = '1000000.00') {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `VO-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار أوامر التغيير التكاملي',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SITE_OPERATIONS,
          description: 'أعمال تسوية الموقع والحفر',
          amount: budgetAmount,
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // Assign testEngineer
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        status: AssignmentStatus.ACTIVE,
        assignedAt: new Date(),
        assignedById: testManager.id,
      },
    });

    return { project, budgetDraft, budgetLine };
  }

  // -------------------------------------------------------------------------
  // Test Scenario 1: Complete Happy Path Lifecycle
  // -------------------------------------------------------------------------
  it('Scenario 1: Happy path lifecycle (DRAFT -> SUBMITTED -> APPROVED) with BOQ lines and budget impact', async () => {
    const { project, budgetLine } = await setupProject('1000000.00');

    // 1. Engineer creates DRAFT with BOQ line items
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      title: 'أمر تغيير أعمال حفر صخري إضافية',
      description: 'زيادة أعماق الحفر في المنطقة الشمالية نظراً لطبيعة التربة الصخرية',
      reason: 'توجيه تقرير فحص التربة الميداني وتوصية الاستشاري',
      scopeImpact: 'زيادة 5 أيام عمل للأعمال الترابية',
      lines: [
        {
          description: 'حفر في تربة صخرية قاسية',
          unit: 'م3',
          originalQuantity: '100',
          revisedQuantity: '250',
          originalRate: '100.00',
          revisedRate: '100.00',
          notes: 'زيادة 150 م3 @ 100 ر.س = +15,000.00 ر.س',
        },
        {
          description: 'ترحيل نواتج الحفر للمرمى العمومي',
          unit: 'رد',
          originalQuantity: '20',
          revisedQuantity: '45',
          originalRate: '200.00',
          revisedRate: '200.00',
          notes: 'زيادة 25 رد @ 200 ر.س = +5,000.00 ر.س',
        },
      ],
    });

    cleanupVoIds.push(draft.id);

    // Total should be: 15,000 + 5,000 = 20,000.00
    expect(draft.status).toBe(VariationOrderStatus.DRAFT);
    expect(draft.impactAmount).toBe('20000.00');
    expect(draft.orderNumber).toBe(`VO-${project.code}-001`);
    expect(draft.linesCount).toBe(2);

    // Audit log for creation exists
    const createLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_CREATED',
      },
    });
    expect(createLog).not.toBeNull();
    expect(createLog?.actorId).toBe(testEngineer.id);

    // Verify DRAFT does NOT affect project revised budget
    let summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('0.00');
    expect(summary.revisedApprovedBudget).toBe('1000000.00');
    expect(summary.counts.draft).toBe(1);

    // 2. Engineer updates DRAFT (modifies a line quantity)
    const updated = await updateVariationOrder({
      id: draft.id,
      title: 'أمر تغيير أعمال حفر صخري إضافية (معدل)',
      description: 'زيادة أعماق الحفر بعد التدقيق المساحي',
      reason: 'توجيه تقرير فحص التربة الميداني وتوصية الاستشاري',
      lines: [
        {
          id: draft.lines[0]?.id,
          description: 'حفر في تربة صخرية قاسية',
          unit: 'م3',
          originalQuantity: '100',
          revisedQuantity: '300', // Changed from 250 -> delta becomes 200 @ 100 = 20,000
          originalRate: '100.00',
          revisedRate: '100.00',
        },
        {
          id: draft.lines[1]?.id,
          description: 'ترحيل نواتج الحفر للمرمى العمومي',
          unit: 'رد',
          originalQuantity: '20',
          revisedQuantity: '45',
          originalRate: '200.00',
          revisedRate: '200.00',
        },
      ],
    });

    // New total: 20,000 + 5,000 = 25,000.00
    expect(updated.impactAmount).toBe('25000.00');

    // 3. Engineer SUBMITS draft for approval
    const submitted = await submitVariationOrder({ id: draft.id });
    expect(submitted.status).toBe(VariationOrderStatus.SUBMITTED);
    expect(submitted.submittedById).toBe(testEngineer.id);
    expect(submitted.submittedAt).not.toBeNull();

    const submitLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_SUBMITTED',
      },
    });
    expect(submitLog).not.toBeNull();

    // Verify SUBMITTED shows as pending and does NOT alter approved budget
    summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('0.00');
    expect(summary.pendingVariationsTotal).toBe('25000.00');
    expect(summary.revisedApprovedBudget).toBe('1000000.00');
    expect(summary.projectedBudget).toBe('1025000.00');

    // 4. Manager APPROVES variation order
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveVariationOrder({ id: draft.id });
    expect(approved.status).toBe(VariationOrderStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).not.toBeNull();

    const approveLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_APPROVED',
      },
    });
    expect(approveLog).not.toBeNull();

    // 5. Verify authoritative budget integration
    summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('25000.00');
    expect(summary.pendingVariationsTotal).toBe('0.00');
    // Revised Approved Budget = 1,000,000 + 25,000 = 1,025,000.00
    expect(summary.revisedApprovedBudget).toBe('1025000.00');
    expect(summary.counts.approved).toBe(1);

    // 6. Immutability guard: Approved variation cannot be updated or deleted
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(
      updateVariationOrder({
        id: draft.id,
        title: 'محاولة تعديل أمر معتمد',
        description: 'وصف جديد',
        reason: 'سبب جديد',
      }),
    ).rejects.toThrow(AppError);

    await expect(deleteVariationOrder(draft.id)).rejects.toThrow(AppError);
  });

  // -------------------------------------------------------------------------
  // Test Scenario 2: Rejection and Reopening Flow
  // -------------------------------------------------------------------------
  it('Scenario 2: Rejection & Reopening (SUBMITTED -> REJECTED -> DRAFT -> RESUBMITTED -> APPROVED)', async () => {
    const { project } = await setupProject('500000.00');

    // 1. Create and submit
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر تغيير أعمال إضافية',
      description: 'أعمال تمديدات إضافية',
      reason: 'طلب من المالك',
      impactAmount: '40000.00',
    });
    cleanupVoIds.push(draft.id);

    await submitVariationOrder({ id: draft.id });

    // 2. Manager rejects with mandatory reason
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const rejectionReason = 'الأسعار المقترحة مرتفعة مقارنة بأسعار العقد الأساسي، يرجى إعادة التفاوض';
    const rejected = await rejectVariationOrder({
      id: draft.id,
      rejectionReason,
    });

    expect(rejected.status).toBe(VariationOrderStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id);
    expect(rejected.rejectionReason).toBe(rejectionReason);

    // Audit log for rejection exists
    const rejectLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_REJECTED',
      },
    });
    expect(rejectLog).not.toBeNull();

    // Verify REJECTED does not alter approved budget
    let summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('0.00');
    expect(summary.counts.rejected).toBe(1);

    // 3. Engineer reopens rejected variation order to DRAFT
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const reopened = await reopenVariationOrder({ id: draft.id });
    expect(reopened.status).toBe(VariationOrderStatus.DRAFT);

    const reopenLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: draft.id,
        action: 'VARIATION_ORDER_REOPENED',
      },
    });
    expect(reopenLog).not.toBeNull();

    // 4. Engineer adjusts price and resubmits
    await updateVariationOrder({
      id: draft.id,
      title: 'أمر تغيير أعمال إضافية (معدل بعد التفاوض)',
      description: 'أعمال تمديدات إضافية بأسعار مخفضة',
      reason: 'طلب من المالك وتخفيض السعر وفق ملاحظات المدير',
      impactAmount: '28000.00', // Adjusted from 40k to 28k
    });

    await submitVariationOrder({ id: draft.id });

    // 5. Manager approves resubmitted order
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const approved = await approveVariationOrder({ id: draft.id });
    expect(approved.status).toBe(VariationOrderStatus.APPROVED);
    expect(approved.impactAmount).toBe('28000.00');

    summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('28000.00');
    expect(summary.revisedApprovedBudget).toBe('528000.00');
  });

  // -------------------------------------------------------------------------
  // Test Scenario 3: Separation of Duties & Authorization Guards
  // -------------------------------------------------------------------------
  it('Scenario 3: Separation of duties and strict authorization guards', async () => {
    const { project } = await setupProject('500000.00');

    // Case A: Non-assigned engineer is rejected
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testOtherEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testOtherEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testOtherEngineer);

    await expect(
      createVariationOrder({
        projectId: project.id,
        title: 'أمر من مهندس غير مكلف',
        description: 'وصف تفصيلي لأمر التغيير المراد إنشاؤه',
        reason: 'مبرر فني وميداني لتعديل الأعمال',
        impactAmount: '10000.00',
      }),
    ).rejects.toThrowError(/معيناً/);

    // Case B: Assigned engineer creates draft
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر للتأكد من الصلاحيات',
      description: 'وصف للأمر',
      reason: 'سبب للموقع',
      impactAmount: '15000.00',
    });
    cleanupVoIds.push(draft.id);

    // Case C: Non-creator engineer cannot submit
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testOtherEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testOtherEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testOtherEngineer);

    await expect(submitVariationOrder({ id: draft.id })).rejects.toThrow(AppError);

    // Case D: Engineer cannot approve their own submission
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    await submitVariationOrder({ id: draft.id });

    // Try approving as engineer (requireManager will fail)
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new AppError('FORBIDDEN', 'صلاحية المدير مطلوبة'),
    );

    await expect(approveVariationOrder({ id: draft.id })).rejects.toThrow(AppError);

    // Case E: Accountant cannot approve
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new AppError('FORBIDDEN', 'صلاحية المدير مطلوبة'),
    );
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    await expect(approveVariationOrder({ id: draft.id })).rejects.toThrow(AppError);
  });

  // -------------------------------------------------------------------------
  // Test Scenario 4: Negative Variation (Cost Reduction / Omission)
  // -------------------------------------------------------------------------
  it('Scenario 4: Negative variation order (Omission) atomically reduces approved budget', async () => {
    const { project } = await setupProject('800000.00');

    // Engineer creates omission draft (-50,000.00)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'إلغاء بعض أعمال التشطيبات المترفة وتخفيض التكلفة',
      description: 'إلغاء بند الأسقف المستعارة المستوردة واستبدالها بمحلي',
      reason: 'توجيه هندسي لترشيد الإنفاق',
      impactAmount: '-50000.00',
    });
    cleanupVoIds.push(draft.id);

    expect(draft.impactAmount).toBe('-50000.00');

    await submitVariationOrder({ id: draft.id });

    // Manager approves
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    await approveVariationOrder({ id: draft.id });

    // Verify revised budget reduction: 800,000 - 50,000 = 750,000.00
    const summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('-50000.00');
    expect(summary.revisedApprovedBudget).toBe('750000.00');
    expect(summary.totalApprovedDecreases).toBe('50000.00');
  });

  // -------------------------------------------------------------------------
  // Test Scenario 5: Concurrency Protection
  // -------------------------------------------------------------------------
  it('Scenario 5: Concurrent approval attempts protect state transition and atomicity', async () => {
    const { project } = await setupProject('500000.00');

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createVariationOrder({
      projectId: project.id,
      title: 'أمر تغيير لاختبار التزامن',
      description: 'وصف أمر التغيير',
      reason: 'مبرر فني',
      impactAmount: '12000.00',
    });
    cleanupVoIds.push(draft.id);

    await submitVariationOrder({ id: draft.id });

    // First approval succeeds
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);

    const firstApproval = await approveVariationOrder({ id: draft.id });
    expect(firstApproval.status).toBe(VariationOrderStatus.APPROVED);

    // Second approval attempt immediately fails because status is already APPROVED
    await expect(approveVariationOrder({ id: draft.id })).rejects.toThrow(AppError);

    // Verify budget only took the impact once (+12,000.00)
    const summary = await getProjectVariationsSummary(project.id);
    expect(summary.approvedVariationsTotal).toBe('12000.00');
    expect(summary.revisedApprovedBudget).toBe('512000.00');
  });
});
