/**
 * tests/unit/lib/expense-use-cases.test.ts
 *
 * Unit tests for Expense use cases (business logic, invariants, ownership, permissions).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, ProjectStatus, ExpenseStatus, BudgetCategory, Prisma } from '@prisma/client';
import {
  createExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  submitExpense,
  approveExpense,
  rejectExpense,
  reopenExpenseDraft,
} from '@/lib/expenses';
import { prisma } from '@/lib/db/prisma';
import * as auth from '@/lib/auth';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

type MockTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type ExpenseRecord = Awaited<ReturnType<typeof prisma.expense.findFirst>>;
type ProjectRecord = Awaited<ReturnType<typeof prisma.project.findFirst>>;
type BudgetRecord = Awaited<ReturnType<typeof prisma.budget.findFirst>>;
type BudgetLineRecord = Awaited<ReturnType<typeof prisma.budgetLine.findFirst>>;

// ---------------------------------------------------------------------------
// Mock Users
// ---------------------------------------------------------------------------

const mockEngineer: AuthenticatedUser = {
  id: 'user-eng',
  email: 'eng@test.local',
  name: 'مهندس الموقع',
  role: Role.ENGINEER,
  isActive: true,
};

const mockAccountant: AuthenticatedUser = {
  id: 'user-acc',
  email: 'acc@test.local',
  name: 'المحاسب المالي',
  role: Role.ACCOUNTANT,
  isActive: true,
};

const mockManager: AuthenticatedUser = {
  id: 'user-mgr',
  email: 'mgr@test.local',
  name: 'المدير العام',
  role: Role.MANAGER,
  isActive: true,
};

const mockPurchasing: AuthenticatedUser = {
  id: 'user-pur',
  email: 'pur@test.local',
  name: 'مسؤول المشتريات',
  role: Role.PURCHASING,
  isActive: true,
};

describe('Expense Use Cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createExpenseDraft', () => {
    const validDraftInput = {
      projectId: 'cju0123456789abcdef012345',
      budgetLineId: 'cju0123456789abcdef012346',
      amount: '5000.00',
      expenseDate: new Date(),
      description: 'شراء كابلات كهربائية للموقع',
    };

    it('allows Engineer to create an expense draft', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
        id: validDraftInput.projectId,
        status: ProjectStatus.ACTIVE,
        name: 'مشروع المستشفى',
        code: 'HOSP-01',
      } as unknown as ProjectRecord);

      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
        id: 'budget-1',
      } as unknown as BudgetRecord);

      vi.spyOn(prisma.budgetLine, 'findFirst').mockResolvedValue({
        id: validDraftInput.budgetLineId,
        category: BudgetCategory.MATERIALS,
        description: 'توريد كابلات',
        amount: new Prisma.Decimal('100000.00'),
      } as unknown as BudgetLineRecord);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            create: vi.fn().mockResolvedValue({
              id: 'exp-1',
              ...validDraftInput,
              amount: new Prisma.Decimal('5000.00'),
              currency: 'SAR',
              status: ExpenseStatus.DRAFT,
              submittedById: mockEngineer.id,
              submittedAt: null,
              approvedById: null,
              approvedAt: null,
              rejectedById: null,
              rejectedAt: null,
              rejectionReason: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              submittedBy: mockEngineer,
              project: { id: validDraftInput.projectId, name: 'مشروع المستشفى', code: 'HOSP-01' },
              budgetLine: {
                id: validDraftInput.budgetLineId,
                category: BudgetCategory.MATERIALS,
                description: 'توريد كابلات',
                amount: new Prisma.Decimal('100000.00'),
              },
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await createExpenseDraft(validDraftInput);
      expect(result.amount).toBe('5000.00');
      expect(result.status).toBe('DRAFT');
      expect(result.submittedById).toBe(mockEngineer.id);
    });

    it('rejects Manager and Purchasing roles from creating site expense drafts', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockManager);
      await expect(createExpenseDraft(validDraftInput)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );

      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockPurchasing);
      await expect(createExpenseDraft(validDraftInput)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('rejects expense draft creation if project is not ACTIVE', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
        id: validDraftInput.projectId,
        status: ProjectStatus.PLANNED, // Not ACTIVE
      } as unknown as ProjectRecord);

      await expect(createExpenseDraft(validDraftInput)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_PROJECT_STATUS' }),
      );
    });

    it('rejects expense draft creation if project has no APPROVED budget', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
        id: validDraftInput.projectId,
        status: ProjectStatus.ACTIVE,
      } as unknown as ProjectRecord);

      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(null); // No approved budget

      await expect(createExpenseDraft(validDraftInput)).rejects.toThrow(
        expect.objectContaining({ code: 'BUDGET_NOT_APPROVED' }),
      );
    });
  });

  describe('updateExpenseDraft', () => {
    const existingDraft = {
      id: 'cju0123456789abcdef012399',
      projectId: 'cju0123456789abcdef012345',
      budgetLineId: 'cju0123456789abcdef012346',
      amount: new Prisma.Decimal('2000.00'),
      description: 'وصف قديم',
      expenseDate: new Date('2026-03-01'),
      status: ExpenseStatus.DRAFT,
      submittedById: mockEngineer.id,
      deletedAt: null,
    };

    const updatePayload = {
      budgetLineId: 'cju0123456789abcdef012346',
      amount: '3500.00',
      description: 'وصف جديد ومعدل',
      expenseDate: new Date('2026-03-02'),
    };

    it('allows claimant to update draft and generates audit deltas', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);

      let capturedAuditMetadata: Record<string, unknown> | null = null;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            update: vi.fn().mockResolvedValue({
              ...existingDraft,
              amount: new Prisma.Decimal(updatePayload.amount),
              description: updatePayload.description,
              expenseDate: updatePayload.expenseDate,
              submittedBy: mockEngineer,
            }),
          },
          auditLog: {
            create: vi.fn().mockImplementation(({ data }: { data: { metadata: Record<string, unknown> } }) => {
              capturedAuditMetadata = data.metadata;
              return {};
            }),
          },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await updateExpenseDraft(existingDraft.id, updatePayload);
      expect(result.amount).toBe('3500.00');
      const deltas = (capturedAuditMetadata?.['deltas'] as unknown as Record<string, { previous: string; new: string }> | undefined) ?? {};
      expect(deltas['amount']?.previous).toBe('2000.00');
      expect(deltas['amount']?.new).toBe('3500.00');
    });

    it('forbids updating drafts owned by another user', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockAccountant); // Not the claimant
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);

      await expect(
        updateExpenseDraft(existingDraft.id, updatePayload),
      ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    });

    it('forbids updating an already APPROVED expense', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue({
        ...existingDraft,
        status: ExpenseStatus.APPROVED,
      } as unknown as ExpenseRecord);

      await expect(
        updateExpenseDraft(existingDraft.id, updatePayload),
      ).rejects.toThrow(expect.objectContaining({ code: 'IMMUTABLE_RECORD' }));
    });
  });

  describe('deleteExpenseDraft', () => {
    const existingDraft = {
      id: 'cju0123456789abcdef012399',
      projectId: 'cju0123456789abcdef012345',
      budgetLineId: 'cju0123456789abcdef012346',
      amount: new Prisma.Decimal('2000.00'),
      description: 'وصف المسودة المراد حذفها',
      expenseDate: new Date('2026-03-01'),
      status: ExpenseStatus.DRAFT,
      submittedById: mockEngineer.id,
      deletedAt: null,
    };

    it('allows claimant to soft-delete draft and records audit log', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);

      let softDeleted = false;
      let auditLogged = false;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            update: vi.fn().mockImplementation(({ data }: { data: { deletedAt?: Date } }) => {
              if (data.deletedAt) softDeleted = true;
              return { ...existingDraft, deletedAt: data.deletedAt };
            }),
          },
          auditLog: {
            create: vi.fn().mockImplementation(() => {
              auditLogged = true;
              return {};
            }),
          },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await deleteExpenseDraft(existingDraft.id);
      expect(result).toEqual({ success: true });
      expect(softDeleted).toBe(true);
      expect(auditLogged).toBe(true);
    });

    it('forbids deleting drafts owned by another user', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockAccountant); // Not owner
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);

      await expect(deleteExpenseDraft(existingDraft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('forbids deleting an approved expense (IMMUTABLE_RECORD)', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue({
        ...existingDraft,
        status: ExpenseStatus.APPROVED,
      } as unknown as ExpenseRecord);

      await expect(deleteExpenseDraft(existingDraft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'IMMUTABLE_RECORD' }),
      );
    });

    it('forbids deleting a submitted expense (EXPENSE_NOT_DRAFT)', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue({
        ...existingDraft,
        status: ExpenseStatus.SUBMITTED,
      } as unknown as ExpenseRecord);

      await expect(deleteExpenseDraft(existingDraft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'EXPENSE_NOT_DRAFT' }),
      );
    });
  });

  describe('submitExpense', () => {
    const existingDraft = {
      id: 'cju0123456789abcdef012399',
      projectId: 'cju0123456789abcdef012345',
      budgetLineId: 'cju0123456789abcdef012346',
      amount: new Prisma.Decimal('2000.00'),
      description: 'وصف المصروف المقدم',
      expenseDate: new Date('2026-03-01'),
      status: ExpenseStatus.DRAFT,
      submittedById: mockEngineer.id,
      deletedAt: null,
      project: {
        id: 'cju0123456789abcdef012345',
        status: ProjectStatus.ACTIVE,
        deletedAt: null,
      },
    };

    it('allows claimant to submit draft and updates status to SUBMITTED', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);
      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue({
        id: 'budget-1',
      } as unknown as BudgetRecord);
      vi.spyOn(prisma.budgetLine, 'findFirst').mockResolvedValue({
        id: existingDraft.budgetLineId,
      } as unknown as BudgetLineRecord);

      let submitted = false;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            update: vi.fn().mockImplementation(({ data }: { data: { status?: ExpenseStatus } }) => {
              submitted = data.status === ExpenseStatus.SUBMITTED;
              return {
                ...existingDraft,
                ...data,
                submittedBy: mockEngineer,
              };
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await submitExpense(existingDraft.id);
      expect(result.status).toBe('SUBMITTED');
      expect(submitted).toBe(true);
    });

    it('forbids submitting draft owned by another user', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockAccountant);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(existingDraft as unknown as ExpenseRecord);

      await expect(submitExpense(existingDraft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('forbids submitting if project is not ACTIVE', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue({
        ...existingDraft,
        project: {
          ...existingDraft.project,
          status: ProjectStatus.ON_HOLD,
        },
      } as unknown as ExpenseRecord);

      await expect(submitExpense(existingDraft.id)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_PROJECT_STATUS' }),
      );
    });
  });

  describe('approveExpense', () => {
    const submittedExpense = {
      id: 'cju0123456789abcdef012377',
      projectId: 'proj-1',
      budgetLineId: 'line-1',
      amount: new Prisma.Decimal('15000.00'),
      status: ExpenseStatus.SUBMITTED,
      submittedById: mockEngineer.id,
      deletedAt: null,
    };

    it('prevents Manager from self-approving their own expense (separation of duties)', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue({
        ...submittedExpense,
        submittedById: mockManager.id, // Manager was the submitter
      } as unknown as ExpenseRecord);

      await expect(approveExpense(submittedExpense.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
      );
    });

    it('throws BUDGET_LINE_EXCEEDED when approval exceeds authorized budget line', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(submittedExpense as unknown as ExpenseRecord);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'line-1', amount: new Prisma.Decimal('20000.00') }, // Line total = 20k
          ]),
          expense: {
            findFirst: vi.fn().mockResolvedValue({
              ...submittedExpense,
              project: { id: 'proj-1', status: ProjectStatus.ACTIVE, deletedAt: null },
            }),
            aggregate: vi.fn().mockResolvedValue({
              _sum: { amount: new Prisma.Decimal('10000.00') }, // Already approved = 10k
            }),
          },
          commitment: {
            aggregate: vi.fn().mockResolvedValue({
              _sum: { amount: new Prisma.Decimal('0.00') },
            }),
          },
          budget: {
            findFirst: vi.fn().mockResolvedValue({ id: 'b-1' }),
          },
          custody: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        };
        // Adding 15k to 10k = 25k > 20k ceiling -> throws BUDGET_LINE_EXCEEDED
        return cb(tx as unknown as MockTx);
      });

      await expect(approveExpense(submittedExpense.id)).rejects.toThrow(
        expect.objectContaining({ code: 'BUDGET_LINE_EXCEEDED' }),
      );
    });
  });

  describe('rejectExpense', () => {
    it('records explicit rejection metadata without touching approvedById', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const submitted = {
        id: 'cju0123456789abcdef012388',
        status: ExpenseStatus.SUBMITTED,
        projectId: 'proj-1',
        budgetLineId: 'line-1',
        amount: new Prisma.Decimal('1000.00'),
        deletedAt: null,
      };

      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(submitted as unknown as ExpenseRecord);

      let updateData: Record<string, unknown> = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
              updateData = data;
              return {
                ...submitted,
                ...data,
                submittedBy: mockEngineer,
              };
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await rejectExpense(submitted.id, {
        rejectionReason: 'يرجى تقديم فاتورة ضريبية أصلية',
      });

      expect(result.status).toBe('REJECTED');
      expect(updateData['rejectedById']).toBe(mockManager.id);
      expect(updateData['approvedById']).toBeUndefined(); // Gate 1 & 18 verified
      expect(updateData['rejectionReason']).toBe('يرجى تقديم فاتورة ضريبية أصلية');
    });
  });

  describe('reopenExpenseDraft', () => {
    it('allows claimant to reopen rejected expense and clears rejection fields', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      const rejected = {
        id: 'cju0123456789abcdef012388',
        status: ExpenseStatus.REJECTED,
        projectId: 'proj-1',
        budgetLineId: 'line-1',
        amount: new Prisma.Decimal('1000.00'),
        submittedById: mockEngineer.id,
        rejectedById: 'user-mgr',
        rejectedAt: new Date(),
        rejectionReason: 'بيانات غير كافية',
        deletedAt: null,
      };

      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(rejected as unknown as ExpenseRecord);

      let clearedData: Record<string, unknown> = {};
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          expense: {
            update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
              clearedData = data;
              return {
                ...rejected,
                ...data,
                submittedBy: mockEngineer,
              };
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await reopenExpenseDraft(rejected.id);
      expect(result.status).toBe('DRAFT');
      expect(clearedData['rejectedById']).toBeNull(); // Gate 17 verified
      expect(clearedData['rejectionReason']).toBeNull();
      expect(clearedData['rejectedAt']).toBeNull();
    });
  });
});
