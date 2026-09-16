/**
 * tests/unit/lib/budget-use-cases.test.ts
 *
 * Unit tests for Project Budget application use cases:
 * - createBudgetDraft
 * - updateBudgetDraft
 * - submitBudget
 * - approveBudget
 * - rejectBudget
 * - reopenBudgetDraft
 * - getProjectBudget
 *
 * Verifies AGENTS.md §5, §8, §12, §13, and §21.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BudgetStatus, BudgetCategory, Role, ProjectStatus, Prisma } from '@prisma/client';

import {
  createBudgetDraft,
  updateBudgetDraft,
  submitBudget,
  approveBudget,
  rejectBudget,
  reopenBudgetDraft,
  getProjectBudget,
} from '@/lib/budget';
import { prisma } from '@/lib/db/prisma';
import * as permissions from '@/lib/permissions';
import { ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions/guards';
import * as auth from '@/lib/auth';
import { AuthError } from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Shared Fixtures
// ---------------------------------------------------------------------------

const mockManager: AuthenticatedUser = {
  id: 'clh0000000000000000000001',
  name: 'المدير التنفيذي',
  email: 'manager@test.local',
  role: Role.MANAGER,
  isActive: true,
};

const validProjectId = 'clh0000000000000000000002';
const validBudgetId = 'clh0000000000000000000003';

const mockProject = {
  id: validProjectId,
  code: 'PRJ-101',
  name: 'مشروع برج الأندلس',
  status: ProjectStatus.PLANNED,
  deletedAt: null,
};

const mockDraftBudgetEntity = {
  id: validBudgetId,
  projectId: validProjectId,
  version: 1,
  status: BudgetStatus.DRAFT,
  totalAmount: new Prisma.Decimal('30.30'),
  currency: 'SAR',
  notes: 'مسودة أولية',
  createdById: mockManager.id,
  createdBy: {
    id: mockManager.id,
    name: mockManager.name,
    email: mockManager.email,
  },
  approvedById: null,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  createdAt: new Date('2026-09-15T10:00:00Z'),
  updatedAt: new Date('2026-09-15T10:00:00Z'),
  deletedAt: null,
  lines: [
    {
      id: 'line-1',
      budgetId: validBudgetId,
      category: BudgetCategory.MATERIALS,
      description: 'أسمنت وحديد',
      amount: new Prisma.Decimal('10.10'),
      createdAt: new Date('2026-09-15T10:00:00Z'),
      updatedAt: new Date('2026-09-15T10:00:00Z'),
    },
    {
      id: 'line-2',
      budgetId: validBudgetId,
      category: BudgetCategory.LABOR,
      description: 'أجور عمالة',
      amount: new Prisma.Decimal('20.20'),
      createdAt: new Date('2026-09-15T10:00:00Z'),
      updatedAt: new Date('2026-09-15T10:00:00Z'),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// createBudgetDraft
// ===========================================================================

describe('createBudgetDraft', () => {
  it('throws PermissionError if caller is not a Manager', async () => {
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    await expect(
      createBudgetDraft({
        projectId: validProjectId,
        lines: [{ category: BudgetCategory.MATERIALS, description: 'خرسانة', amount: '500' }],
      }),
    ).rejects.toThrow(PermissionError);
  });

  it('throws ValidationError for invalid payload', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(
      createBudgetDraft({
        projectId: 'not-a-cuid',
        lines: [],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NOT_FOUND if project does not exist', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

    await expect(
      createBudgetDraft({
        projectId: validProjectId,
        lines: [{ category: BudgetCategory.MATERIALS, description: 'خرسانة', amount: '500' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('throws INVALID_PROJECT_STATUS if project is COMPLETED or CANCELLED', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      ...mockProject,
      status: ProjectStatus.COMPLETED,
    } as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>);

    await expect(
      createBudgetDraft({
        projectId: validProjectId,
        lines: [{ category: BudgetCategory.MATERIALS, description: 'خرسانة', amount: '500' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_PROJECT_STATUS' }));
  });

  it('throws ALREADY_EXISTS if project already has an active budget', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      mockProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      id: 'existing-budget',
      status: BudgetStatus.DRAFT,
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    await expect(
      createBudgetDraft({
        projectId: validProjectId,
        lines: [{ category: BudgetCategory.MATERIALS, description: 'خرسانة', amount: '500' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'ALREADY_EXISTS' }));
  });

  it('calculates totalAmount using exact Decimal arithmetic and writes BUDGET_CREATED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      mockProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(null);

    const mockTx = {
      budget: {
        create: vi.fn().mockResolvedValue(mockDraftBudgetEntity),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await createBudgetDraft({
      projectId: validProjectId,
      notes: 'ملاحظات المسودة',
      lines: [
        { category: BudgetCategory.MATERIALS, description: 'أسمنت وحديد', amount: '10.10' },
        { category: BudgetCategory.LABOR, description: 'أجور عمالة', amount: '20.20' },
      ],
    });

    expect(result.status).toBe(BudgetStatus.DRAFT);
    expect(result.totalAmount).toBe('30.30');

    // Verify Prisma Decimal creation was called with 30.30 (not 30.299999999999997)
    expect(mockTx.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: new Prisma.Decimal('30.30'),
          projectId: validProjectId,
          version: 1,
        }),
      }),
    );

    // Verify audit log
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_CREATED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// updateBudgetDraft
// ===========================================================================

describe('updateBudgetDraft', () => {
  it('throws IMMUTABLE_RECORD if budget is already APPROVED', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      status: BudgetStatus.APPROVED,
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    await expect(
      updateBudgetDraft(validBudgetId, {
        lines: [{ category: BudgetCategory.MATERIALS, description: 'تعديل', amount: '100' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'IMMUTABLE_RECORD' }));
  });

  it('throws INVALID_STATE_TRANSITION if budget is SUBMITTED', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      status: BudgetStatus.SUBMITTED,
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    await expect(
      updateBudgetDraft(validBudgetId, {
        lines: [{ category: BudgetCategory.MATERIALS, description: 'تعديل', amount: '100' }],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('updates draft lines, recalculates totalAmount, and writes BUDGET_UPDATED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    const mockTx = {
      budgetLine: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      budget: { update: vi.fn().mockResolvedValue(mockDraftBudgetEntity) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-2' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    await updateBudgetDraft(validBudgetId, {
      notes: 'ملاحظة محدثة',
      lines: [
        { category: BudgetCategory.MATERIALS, description: 'حديد', amount: '5000' },
        { category: BudgetCategory.EQUIPMENT, description: 'رافعة', amount: '2500' },
      ],
    });

    expect(mockTx.budgetLine.deleteMany).toHaveBeenCalledWith({ where: { budgetId: validBudgetId } });
    expect(mockTx.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validBudgetId },
        data: expect.objectContaining({
          totalAmount: new Prisma.Decimal('7500.00'),
          notes: 'ملاحظة محدثة',
        }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_UPDATED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// submitBudget
// ===========================================================================

describe('submitBudget', () => {
  it('throws EMPTY_BUDGET if budget has no lines', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      lines: [],
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    await expect(submitBudget(validBudgetId)).rejects.toThrow(
      expect.objectContaining({ code: 'EMPTY_BUDGET' }),
    );
  });

  it('transitions DRAFT → SUBMITTED and writes BUDGET_SUBMITTED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    const updatedEntity = {
      ...mockDraftBudgetEntity,
      status: BudgetStatus.SUBMITTED,
    };

    const mockTx = {
      budget: { update: vi.fn().mockResolvedValue(updatedEntity) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-3' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await submitBudget(validBudgetId);

    expect(result.status).toBe(BudgetStatus.SUBMITTED);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_SUBMITTED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// approveBudget
// ===========================================================================

describe('approveBudget', () => {
  it('throws INVALID_STATE_TRANSITION if budget is in DRAFT (skipping submission)', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    await expect(approveBudget(validBudgetId)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });

  it('transitions SUBMITTED → APPROVED, records approvedBy and writes BUDGET_APPROVED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      status: BudgetStatus.SUBMITTED,
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    const approvedEntity = {
      ...mockDraftBudgetEntity,
      status: BudgetStatus.APPROVED,
      approvedById: mockManager.id,
      approvedBy: { id: mockManager.id, name: mockManager.name, email: mockManager.email },
      approvedAt: new Date(),
    };

    const mockTx = {
      budget: { update: vi.fn().mockResolvedValue(approvedEntity) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-4' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await approveBudget(validBudgetId);

    expect(result.status).toBe(BudgetStatus.APPROVED);
    expect(mockTx.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validBudgetId },
        data: expect.objectContaining({
          status: BudgetStatus.APPROVED,
          approvedById: mockManager.id,
        }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_APPROVED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// rejectBudget
// ===========================================================================

describe('rejectBudget', () => {
  it('throws ValidationError if rejectionReason is missing or too short', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(rejectBudget(validBudgetId, { rejectionReason: '' })).rejects.toThrow(
      ValidationError,
    );
    await expect(rejectBudget(validBudgetId, { rejectionReason: 'لا' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('throws INVALID_STATE_TRANSITION if budget is in DRAFT', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    await expect(
      rejectBudget(validBudgetId, { rejectionReason: 'المبالغ غير واقعية' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('transitions SUBMITTED → REJECTED, records reason and writes BUDGET_REJECTED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      status: BudgetStatus.SUBMITTED,
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    const rejectedEntity = {
      ...mockDraftBudgetEntity,
      status: BudgetStatus.REJECTED,
      rejectionReason: 'المبالغ المقدرة مرتفعة جداً',
    };

    const mockTx = {
      budget: { update: vi.fn().mockResolvedValue(rejectedEntity) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-5' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await rejectBudget(validBudgetId, {
      rejectionReason: 'المبالغ المقدرة مرتفعة جداً',
    });

    expect(result.status).toBe(BudgetStatus.REJECTED);
    expect(mockTx.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validBudgetId },
        data: expect.objectContaining({
          status: BudgetStatus.REJECTED,
          rejectionReason: 'المبالغ المقدرة مرتفعة جداً',
        }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_REJECTED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// reopenBudgetDraft
// ===========================================================================

describe('reopenBudgetDraft', () => {
  it('throws INVALID_STATE_TRANSITION if budget is not REJECTED', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    await expect(reopenBudgetDraft(validBudgetId)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });

  it('transitions REJECTED → DRAFT on the same record and writes BUDGET_REOPENED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
      ...mockDraftBudgetEntity,
      status: BudgetStatus.REJECTED,
      rejectionReason: 'سبب سابق',
    } as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>);

    const reopenedEntity = {
      ...mockDraftBudgetEntity,
      status: BudgetStatus.DRAFT,
    };

    const mockTx = {
      budget: { update: vi.fn().mockResolvedValue(reopenedEntity) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-6' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await reopenBudgetDraft(validBudgetId);

    expect(result.status).toBe(BudgetStatus.DRAFT);
    expect(mockTx.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validBudgetId },
        data: { status: BudgetStatus.DRAFT },
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUDGET_REOPENED',
          entityType: 'BUDGET',
          entityId: validBudgetId,
        }),
      }),
    );
  });
});

// ===========================================================================
// getProjectBudget
// ===========================================================================

describe('getProjectBudget', () => {
  it('throws AuthError if user is not authenticated', async () => {
    vi.spyOn(auth, 'requireAuth').mockRejectedValue(new AuthError('UNAUTHENTICATED'));

    await expect(getProjectBudget(validProjectId)).rejects.toThrow(AuthError);
  });

  it('returns null if no budget exists for project', async () => {
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(null);

    const result = await getProjectBudget(validProjectId);
    expect(result).toBeNull();
  });

  it('returns formatted BudgetDetailsDTO with string amounts when budget exists', async () => {
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockManager);
    vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(
      mockDraftBudgetEntity as unknown as Awaited<ReturnType<typeof prisma.budget.findFirst>>,
    );

    const result = await getProjectBudget(validProjectId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(validBudgetId);
    expect(result?.totalAmount).toBe('30.30');
    expect(result?.lines).toHaveLength(2);
    expect(result?.lines[0]?.amount).toBe('10.10');
    expect(result?.lines[1]?.amount).toBe('20.20');
  });
});
