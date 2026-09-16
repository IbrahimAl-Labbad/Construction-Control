/**
 * tests/integration/budget-lifecycle.test.ts
 *
 * Full integration tests for Project Budget lifecycle against live PostgreSQL:
 * 1. Creates a budget draft with lines and verifies atomic persistence & audit log.
 * 2. Proves cross-domain invariant: cannot activate project while budget is not APPROVED.
 * 3. Updates budget draft lines and recalculates Decimal total.
 * 4. Submits budget, rejects it with reason, reopens it as draft on same record.
 * 5. Approves budget, locking it as immutable baseline.
 * 6. Proves immutability of approved budget.
 * 7. Proves PostgreSQL partial unique index: at most one APPROVED budget per project.
 * 8. Proves project activation gate succeeds once budget is APPROVED.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetStatus, BudgetCategory, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createBudgetDraft,
  updateBudgetDraft,
  submitBudget,
  rejectBudget,
  reopenBudgetDraft,
  approveBudget,
} from '@/lib/budget';
import { createProject, changeProjectStatus } from '@/lib/projects';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Budget Lifecycle Integration (Live PostgreSQL)', () => {
  let testManager: { id: string; name: string; email: string; role: Role; isActive: boolean };
  const createdProjectIds: string[] = [];
  const createdBudgetIds: string[] = [];

  beforeEach(async () => {
    // Find or create test Manager in DB
    let manager = await prisma.user.findFirst({
      where: {
        role: Role.MANAGER,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!manager) {
      manager = await prisma.user.create({
        data: {
          name: 'مدير موازنات التكامل',
          email: `test.budget.manager.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    testManager = manager;

    const authManager: AuthenticatedUser = {
      id: testManager.id,
      name: testManager.name,
      email: testManager.email,
      role: Role.MANAGER,
      isActive: true,
    };

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(authManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Clean up created budgets and lines
    for (const bId of createdBudgetIds) {
      await prisma.budgetLine.deleteMany({ where: { budgetId: bId } });
      await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: bId } });
      await prisma.budget.deleteMany({ where: { id: bId } });
    }
    createdBudgetIds.length = 0;

    // Clean up created projects
    for (const pId of createdProjectIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    createdProjectIds.length = 0;
  });

  it('proves complete budget lifecycle and cross-domain project activation gate', async () => {
    // 1. Create a Project in PLANNED state
    const uniqueCode = `PRJ-B-${Math.floor(Math.random() * 89999 + 10000)}`;
    const project = await createProject({
      code: uniqueCode,
      name: 'مشروع اختبار الموازنة المتكاملة',
      managerId: testManager.id,
    });
    createdProjectIds.push(project.id);
    expect(project.status).toBe(ProjectStatus.PLANNED);

    // 2. Try to activate project without budget -> MUST FAIL with BUDGET_REQUIRED
    await expect(
      changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE }),
    ).rejects.toThrow(expect.objectContaining({ code: 'BUDGET_REQUIRED' }));

    // 3. Create Budget Draft
    const draft = await createBudgetDraft({
      projectId: project.id,
      notes: 'موازنة المرحلة الأولى',
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'خرسانة مسلحة وحديد تسليح',
          amount: '120500.25',
        },
        {
          category: BudgetCategory.LABOR,
          description: 'أجور حدادين ونجارين',
          amount: '45000.75',
        },
      ],
    });
    createdBudgetIds.push(draft.id);

    expect(draft.status).toBe(BudgetStatus.DRAFT);
    expect(draft.version).toBe(1);
    expect(draft.totalAmount).toBe('165501.00'); // 120500.25 + 45000.75
    expect(draft.lines).toHaveLength(2);

    // Verify AuditLog for BUDGET_CREATED
    const createAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'BUDGET', entityId: draft.id, action: 'BUDGET_CREATED' },
    });
    expect(createAudit).not.toBeNull();

    // 4. Project activation still fails because budget is in DRAFT (not APPROVED)
    await expect(
      changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE }),
    ).rejects.toThrow(expect.objectContaining({ code: 'BUDGET_REQUIRED' }));

    // 5. Update Draft
    const updatedDraft = await updateBudgetDraft(draft.id, {
      notes: 'موازنة معدلة',
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'خرسانة مسلحة وحديد تسليح بعد التخفيض',
          amount: '100000.00',
        },
        {
          category: BudgetCategory.LABOR,
          description: 'أجور عمالة',
          amount: '40000.00',
        },
        {
          category: BudgetCategory.EQUIPMENT,
          description: 'إيجار حفار ومضخة',
          amount: '15000.00',
        },
      ],
    });

    expect(updatedDraft.totalAmount).toBe('155000.00');
    expect(updatedDraft.lines).toHaveLength(3);

    // 6. Submit Budget
    const submitted = await submitBudget(draft.id);
    expect(submitted.status).toBe(BudgetStatus.SUBMITTED);

    // 7. Reject Budget with reason
    const rejected = await rejectBudget(draft.id, {
      rejectionReason: 'المبالغ المخصصة للمعدات بحاجة لإعادة تفاوض',
    });
    expect(rejected.status).toBe(BudgetStatus.REJECTED);
    expect(rejected.rejectionReason).toBe('المبالغ المخصصة للمعدات بحاجة لإعادة تفاوض');

    // 8. Reopen Budget back to DRAFT (same record, Version 1)
    const reopened = await reopenBudgetDraft(draft.id);
    expect(reopened.id).toBe(draft.id);
    expect(reopened.status).toBe(BudgetStatus.DRAFT);
    expect(reopened.version).toBe(1);

    // 9. Re-submit and Approve
    await submitBudget(draft.id);
    const approved = await approveBudget(draft.id);

    expect(approved.status).toBe(BudgetStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).not.toBeNull();

    // 10. Immutability verification: updating an approved budget must fail
    await expect(
      updateBudgetDraft(draft.id, {
        lines: [{ category: BudgetCategory.MATERIALS, description: 'محاولة تعديل', amount: '1000' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'IMMUTABLE_RECORD' }));

    // 11. Partial unique index verification: inserting another APPROVED budget for same project fails
    await expect(
      prisma.budget.create({
        data: {
          projectId: project.id,
          version: 2,
          status: BudgetStatus.APPROVED,
          totalAmount: new Prisma.Decimal('50000.00'),
          currency: 'SAR',
          createdById: testManager.id,
        },
      }),
    ).rejects.toThrow();

    // 12. Cross-domain invariant: Project can NOW be transitioned PLANNED → ACTIVE!
    const activeProject = await changeProjectStatus(project.id, {
      newStatus: ProjectStatus.ACTIVE,
      reason: 'تم اعتماد الموازنة وبدء التنفيذ',
    });

    expect(activeProject.status).toBe(ProjectStatus.ACTIVE);

    // Verify live DB status
    const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(dbProject?.status).toBe(ProjectStatus.ACTIVE);
  });
});
