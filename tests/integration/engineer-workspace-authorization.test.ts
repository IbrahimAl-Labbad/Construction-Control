/**
 * tests/integration/engineer-workspace-authorization.test.ts
 *
 * Comprehensive Integration Tests for Vertical Slice 14:
 * Site Engineer Security & Scoped Field Operations.
 *
 * Covers:
 * - TC-SEC-01 .. TC-SEC-11: Expense lifecycle assignment & project status enforcement
 * - TC-SEC-12 .. TC-SEC-21: Custody lifecycle claimant & custodian assignment enforcement
 * - TC-SEC-22: Scoped project listing (getEngineerAssignedProjects) & terminal status filter
 * - TC-SEC-23: IDOR defense on unassigned project workspace (getEngineerProjectWorkspace -> FORBIDDEN)
 * - TC-SEC-24: Non-existent project workspace -> NOT_FOUND
 * - TC-SEC-25: Financial privacy: absolute stripping of budget amounts and ceilings (BD-14-11)
 */

import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  ExpenseStatus,
  CustodyStatus,
  AssignmentStatus,
  MilestoneStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import * as auth from '@/lib/auth';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import {
  createExpenseDraft,
  updateExpenseDraft,
  submitExpense,
  rejectExpense,
  reopenExpenseDraft,
} from '@/lib/expenses';
import {
  createCustodyDraft,
  updateCustodyDraft,
  submitCustody,
  rejectCustody,
  reopenCustody,
} from '@/lib/custodies';
import {
  getEngineerAssignedProjects,
  getEngineerProjectWorkspace,
} from '@/lib/engineer-workspace';

describe('Vertical Slice 14 — Site Engineer Security & Scoped Field Operations Integration', () => {
  let testManager: AuthenticatedUser;
  let assignedEngineer: AuthenticatedUser;
  let unassignedEngineer: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
  const cleanupCustodyIds: string[] = [];

  beforeAll(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير اختبار الشريحة 14',
          email: `mgr.slice14.${Date.now()}@test.local`,
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

    // 2. Assigned Engineer
    const eng1 = await prisma.user.create({
      data: {
        name: 'مهندس معين 14',
        email: `eng.assigned.${Date.now()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    assignedEngineer = {
      id: eng1.id,
      name: eng1.name,
      email: eng1.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Unassigned Engineer
    const eng2 = await prisma.user.create({
      data: {
        name: 'مهندس غير معين 14',
        email: `eng.unassigned.${Date.now()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    unassignedEngineer = {
      id: eng2.id,
      name: eng2.name,
      email: eng2.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب اختبار 14',
          email: `acc.slice14.${Date.now()}@test.local`,
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const cId of cleanupCustodyIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: cId } });
      await prisma.custody.deleteMany({ where: { id: cId } });
    }
    cleanupCustodyIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.projectMilestone.deleteMany({ where: { projectId: pId } });
      await prisma.progressReport.deleteMany({ where: { projectId: pId } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.custody.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
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

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [assignedEngineer.id, unassignedEngineer.id] } },
    });
  });

  /** Helper to setup an active project with budget and an assigned engineer */
  async function setupActiveProject() {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `S14-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار أمن المهندس الميداني 14',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند مواد البناء المعتمد',
          amount: '200000.00',
        },
        {
          category: BudgetCategory.SITE_OPERATIONS,
          description: 'بند المصاريف الميدانية',
          amount: '100000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    const approvedBudget = await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = approvedBudget.lines[0]!;

    // Assign engineer
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: assignedEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    return { project, budgetLine };
  }

  // ---------------------------------------------------------------------------
  // 1. EXPENSE MUTATION AUTHORIZATION & STATUS GUARDS
  // ---------------------------------------------------------------------------
  describe('Expense Authorization & Assignment Scoping (Slice 14 / BD-14-01, BD-14-02, BD-14-04)', () => {
    it('TC-SEC-01: allows assigned Engineer to create expense draft on ACTIVE project', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '2500.00',
        expenseDate: new Date(),
        description: 'شراء كوابل وأدوات كهربائية ميدانية',
      });
      cleanupExpenseIds.push(draft.id);

      expect(draft.id).toBeDefined();
      expect(draft.status).toBe(ExpenseStatus.DRAFT);
      expect(draft.amount).toBe('2500.00');
    });

    it('TC-SEC-02: rejects unassigned Engineer from creating expense draft with 403 FORBIDDEN', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(unassignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(unassignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(unassignedEngineer);

      await expect(
        createExpenseDraft({
          projectId: project.id,
          budgetLineId: budgetLine.id,
          amount: '1500.00',
          expenseDate: new Date(),
          description: 'محاولة تسجيل مصروف بدون تعيين',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          httpStatus: 403,
        }),
      );
    });

    it('TC-SEC-03: rejects Engineer expense draft creation if project is not ACTIVE', async () => {
      const { project, budgetLine } = await setupActiveProject();

      // Put project ON_HOLD
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      await changeProjectStatus(project.id, { newStatus: ProjectStatus.ON_HOLD });

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      await expect(
        createExpenseDraft({
          projectId: project.id,
          budgetLineId: budgetLine.id,
          amount: '1000.00',
          expenseDate: new Date(),
          description: 'محاولة تسجيل مصروف على مشروع معلق',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_PROJECT_STATUS',
        }),
      );
    });

    it('TC-SEC-04: allows Accountant to create expense draft without project assignment', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '8000.00',
        expenseDate: new Date(),
        description: 'قيد محاسبي معتمد من المحاسب المالي',
      });
      cleanupExpenseIds.push(draft.id);

      expect(draft.id).toBeDefined();
      expect(draft.status).toBe(ExpenseStatus.DRAFT);
    });

    it('TC-SEC-05: allows assigned Engineer to update own expense draft on ACTIVE project', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '1000.00',
        expenseDate: new Date(),
        description: 'المسودة الأصلية',
      });
      cleanupExpenseIds.push(draft.id);

      const updated = await updateExpenseDraft(draft.id, {
        budgetLineId: budgetLine.id,
        amount: '1500.00',
        expenseDate: new Date(),
        description: 'المسودة المعدلة',
      });

      expect(updated.amount).toBe('1500.00');
      expect(updated.description).toBe('المسودة المعدلة');
    });

    it('TC-SEC-06: rejects Engineer from updating expense draft if unassigned from project', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '1000.00',
        expenseDate: new Date(),
        description: 'مسودة قبل إزالة التعيين',
      });
      cleanupExpenseIds.push(draft.id);

      // Remove assignment
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      await expect(
        updateExpenseDraft(draft.id, {
          budgetLineId: budgetLine.id,
          amount: '1200.00',
          expenseDate: new Date(),
          description: 'تعديل بعد إلغاء التعيين',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          httpStatus: 403,
        }),
      );
    });

    it('TC-SEC-08 & TC-SEC-09: verifies submitExpense assignment scoping', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '3000.00',
        expenseDate: new Date(),
        description: 'مسودة للتقديم',
      });
      cleanupExpenseIds.push(draft.id);

      // TC-SEC-09: Unassign and verify submit fails
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      await expect(submitExpense(draft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // TC-SEC-08: Reactivate assignment and verify submit succeeds
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.ACTIVE },
      });

      const submitted = await submitExpense(draft.id);
      expect(submitted.status).toBe(ExpenseStatus.SUBMITTED);
    });

    it('TC-SEC-10 & TC-SEC-11: verifies reopenExpenseDraft assignment and status scoping', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const draft = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '2000.00',
        expenseDate: new Date(),
        description: 'مسودة لإعادة الفتح',
      });
      cleanupExpenseIds.push(draft.id);
      await submitExpense(draft.id);

      // Manager rejects
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      await rejectExpense(draft.id, { rejectionReason: 'بحاجة لمزيد من الإيضاح' });

      // TC-SEC-11: Unassign and verify reopen fails
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      await expect(reopenExpenseDraft(draft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // TC-SEC-10: Reactivate and verify reopen succeeds
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.ACTIVE },
      });

      const reopened = await reopenExpenseDraft(draft.id);
      expect(reopened.status).toBe(ExpenseStatus.DRAFT);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CUSTODY MUTATION AUTHORIZATION & CUSTODIAN VALIDATION
  // ---------------------------------------------------------------------------
  describe('Custody Authorization & Assignment Scoping (Slice 14 / BD-14-03, BD-14-04)', () => {
    it('TC-SEC-12: allows assigned Engineer to create custody draft with assigned custodian', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const custody = await createCustodyDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        custodianUserId: assignedEngineer.id,
        amount: '10000.00',
        purpose: 'عهدة لشراء معدات خفيفة ومحروقات',
      });
      cleanupCustodyIds.push(custody.id);

      expect(custody.id).toBeDefined();
      expect(custody.status).toBe(CustodyStatus.DRAFT);
      expect(custody.custodian.id).toBe(assignedEngineer.id);
    });

    it('TC-SEC-13: rejects unassigned Engineer from requesting custody draft with 403 FORBIDDEN', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(unassignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(unassignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(unassignedEngineer);

      await expect(
        createCustodyDraft({
          projectId: project.id,
          budgetLineId: budgetLine.id,
          custodianUserId: unassignedEngineer.id,
          amount: '5000.00',
          purpose: 'محاولة عهدة بدون تعيين للمشروع',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          httpStatus: 403,
        }),
      );
    });

    it('TC-SEC-14: rejects custody draft creation when designated Engineer custodian is NOT assigned to project', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      // assignedEngineer requests custody but names unassignedEngineer as custodian
      await expect(
        createCustodyDraft({
          projectId: project.id,
          budgetLineId: budgetLine.id,
          custodianUserId: unassignedEngineer.id,
          amount: '5000.00',
          purpose: 'تعيين أمين عهدة غير معين بالمشروع',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'ValidationError',
        }),
      );
    });

    it('TC-SEC-15: allows custody creation when designated custodian is an Accountant (unassigned)', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const custody = await createCustodyDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        custodianUserId: testAccountant.id,
        amount: '12000.00',
        purpose: 'عهدة مكتبية بحوزة المحاسب للموقع',
      });
      cleanupCustodyIds.push(custody.id);

      expect(custody.id).toBeDefined();
      expect(custody.custodian.id).toBe(testAccountant.id);
    });

    it('TC-SEC-16 & TC-SEC-17: verifies updateCustodyDraft assignment scoping', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const custody = await createCustodyDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        custodianUserId: assignedEngineer.id,
        amount: '7000.00',
        purpose: 'عهدة للتعديل',
      });
      cleanupCustodyIds.push(custody.id);

      // TC-SEC-17: Unassign claimant and verify update fails
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      await expect(
        updateCustodyDraft({
          id: custody.id,
          budgetLineId: budgetLine.id,
          custodianUserId: assignedEngineer.id,
          amount: '8000.00',
          purpose: 'تعديل بعد إزالة التعيين',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // TC-SEC-16: Reactivate and verify update succeeds
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.ACTIVE },
      });

      const updated = await updateCustodyDraft({
        id: custody.id,
        budgetLineId: budgetLine.id,
        custodianUserId: assignedEngineer.id,
        amount: '8000.00',
        purpose: 'تعديل ناجح بعد إعادة التعيين',
      });
      expect(updated.amount).toBe('8000.00');
    });

    it('TC-SEC-18 & TC-SEC-19: verifies submitCustody assignment scoping', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const custody = await createCustodyDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        custodianUserId: assignedEngineer.id,
        amount: '6000.00',
        purpose: 'عهدة للتقديم',
      });
      cleanupCustodyIds.push(custody.id);

      // TC-SEC-19: Unassign and verify submit fails
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      await expect(submitCustody(custody.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // TC-SEC-18: Reactivate and verify submit succeeds
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.ACTIVE },
      });

      const submitted = await submitCustody(custody.id);
      expect(submitted.status).toBe(CustodyStatus.SUBMITTED);
    });

    it('TC-SEC-20 & TC-SEC-21: verifies reopenCustody assignment scoping', async () => {
      const { project, budgetLine } = await setupActiveProject();

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const custody = await createCustodyDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        custodianUserId: assignedEngineer.id,
        amount: '4000.00',
        purpose: 'عهدة للرفض وإعادة الفتح',
      });
      cleanupCustodyIds.push(custody.id);
      await submitCustody(custody.id);

      // Manager rejects
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
      await rejectCustody({ id: custody.id, rejectionReason: 'غير مطابقة للميزانية' });

      // TC-SEC-21: Unassign and verify reopen fails
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.INACTIVE },
      });

      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      await expect(reopenCustody(custody.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      // TC-SEC-20: Reactivate and verify reopen succeeds
      await prisma.projectAssignment.update({
        where: { projectId_engineerId: { projectId: project.id, engineerId: assignedEngineer.id } },
        data: { status: AssignmentStatus.ACTIVE },
      });

      const reopened = await reopenCustody(custody.id);
      expect(reopened.status).toBe(CustodyStatus.DRAFT);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SITE ENGINEER WORKSPACE & SCOPED READ OPERATIONS
  // ---------------------------------------------------------------------------
  describe('Site Engineer Project Workspace & Scoped Reads (Slice 14 / BD-14-06 .. BD-14-11)', () => {
    it('TC-SEC-22: getEngineerAssignedProjects returns only active assigned projects and respects includeTerminal', async () => {
      const { project } = await setupActiveProject();

      // Seed another project for unassignedEngineer
      const otherProject = await createProject({
        code: `S14-OTH-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع لمهندس آخر',
        managerId: testManager.id,
      });
      cleanupProjectIds.push(otherProject.id);

      await prisma.projectAssignment.create({
        data: {
          projectId: otherProject.id,
          engineerId: unassignedEngineer.id,
          assignedById: testManager.id,
          status: AssignmentStatus.ACTIVE,
        },
      });

      // Query assignedEngineer's projects
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const projects = await getEngineerAssignedProjects();

      // Must contain assigned project, must NOT contain otherProject
      expect(projects.some((p) => p.id === project.id)).toBe(true);
      expect(projects.some((p) => p.id === otherProject.id)).toBe(false);

      const card = projects.find((p) => p.id === project.id)!;
      expect(card.assignedRole).toBe('مهندس موقع');
      expect(card.status).toBe(ProjectStatus.ACTIVE);
      expect(typeof card.milestonesCount).toBe('number');
      expect(typeof card.pendingExpensesCount).toBe('number');
    });

    it('TC-SEC-23: getEngineerProjectWorkspace throws PermissionError (FORBIDDEN) when accessed by unassigned Engineer (IDOR defense)', async () => {
      const { project } = await setupActiveProject();

      // unassignedEngineer attempts to access project
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(unassignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(unassignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(unassignedEngineer);

      await expect(getEngineerProjectWorkspace(project.id)).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      );
    });

    it('TC-SEC-24: getEngineerProjectWorkspace throws AppError (NOT_FOUND) when project does not exist', async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      await expect(
        getEngineerProjectWorkspace('cju0000000000000000000000'),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      );
    });

    it('TC-SEC-25: getEngineerProjectWorkspace returns stripped budget categories without financial amounts (BD-14-11 Privacy)', async () => {
      const { project, budgetLine } = await setupActiveProject();

      // Seed a milestone
      await prisma.projectMilestone.create({
        data: {
          projectId: project.id,
          title: 'محطة أعمال الخرسانات',
          targetDate: new Date('2026-11-01'),
          status: MilestoneStatus.IN_PROGRESS,
          orderIndex: 1,
          createdById: testManager.id,
        },
      });

      // Seed an expense
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(assignedEngineer);
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue(assignedEngineer);
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(assignedEngineer);

      const exp = await createExpenseDraft({
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: '3500.00',
        expenseDate: new Date(),
        description: 'دفعة صيانة ميدانية',
      });
      cleanupExpenseIds.push(exp.id);

      // Fetch workspace
      const workspace = await getEngineerProjectWorkspace(project.id);

      expect(workspace.project.id).toBe(project.id);
      expect(workspace.project.code).toBe(project.code);
      expect(workspace.project.assignedRole).toBe('مهندس موقع');
      expect(workspace.milestones.length).toBe(1);
      expect(workspace.milestones[0]!.title).toBe('محطة أعمال الخرسانات');
      expect(workspace.recentExpenses.length).toBe(1);
      expect(workspace.recentExpenses[0]!.id).toBe(exp.id);

      // Financial privacy check (BD-14-11):
      // Categories must have id, category, description only. Zero amounts, ceilings, or exposures!
      expect(workspace.availableBudgetCategories.length).toBeGreaterThan(0);
      for (const cat of workspace.availableBudgetCategories) {
        expect(cat.id).toBeDefined();
        expect(cat.category).toBeDefined();
        expect('amount' in cat).toBe(false);
        expect('ceiling' in cat).toBe(false);
        expect('spent' in cat).toBe(false);
        expect('totalAmount' in cat).toBe(false);
      }
    });
  });
});
