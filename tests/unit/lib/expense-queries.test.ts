/**
 * tests/unit/lib/expense-queries.test.ts
 *
 * Unit tests for Expense queries and read operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, ExpenseStatus, BudgetCategory, Prisma } from '@prisma/client';
import { getExpense } from '@/lib/expenses/use-cases/get-expense';
import { getUserExpenses } from '@/lib/expenses/queries/get-user-expenses';
import { getActiveProjectsForExpenses } from '@/lib/expenses/queries/get-active-projects-for-expenses';
import { prisma } from '@/lib/db/prisma';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

type ExpenseRecord = Awaited<ReturnType<typeof prisma.expense.findFirst>>;
type ExpenseListRecord = Awaited<ReturnType<typeof prisma.expense.findMany>>;
type ProjectWithBudgetsList = Awaited<ReturnType<typeof prisma.project.findMany>>;

const mockEngineer: AuthenticatedUser = {
  id: 'user-eng',
  email: 'eng@test.local',
  name: 'مهندس الموقع',
  role: Role.ENGINEER,
  isActive: true,
};

const mockPurchasing: AuthenticatedUser = {
  id: 'user-pur',
  email: 'pur@test.local',
  name: 'مسؤول المشتريات',
  role: Role.PURCHASING,
  isActive: true,
};

describe('Expense Queries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getExpense', () => {
    it('retrieves an existing non-deleted expense for authorized user', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      const mockRecord = {
        id: 'cju0123456789abcdef012399',
        projectId: 'proj-1',
        budgetLineId: 'line-1',
        amount: new Prisma.Decimal('1200.00'),
        currency: 'SAR',
        description: 'شراء حديد إضافي',
        expenseDate: new Date('2026-03-01'),
        status: ExpenseStatus.DRAFT,
        submittedById: mockEngineer.id,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date('2026-03-01'),
        updatedAt: new Date('2026-03-01'),
        submittedBy: { id: mockEngineer.id, name: mockEngineer.name, email: mockEngineer.email },
        approvedBy: null,
        rejectedBy: null,
        budgetLine: {
          id: 'line-1',
          category: BudgetCategory.MATERIALS,
          description: 'مواد بناء',
          amount: new Prisma.Decimal('50000.00'),
        },
        project: { id: 'proj-1', name: 'مشروع المستشفى', code: 'HOSP-01' },
      };

      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(mockRecord as unknown as ExpenseRecord);

      const result = await getExpense(mockRecord.id);
      expect(result.id).toBe(mockRecord.id);
      expect(result.amount).toBe('1200.00');
      expect(result.status).toBe('DRAFT');
    });

    it('throws NOT_FOUND if expense does not exist', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);
      vi.spyOn(prisma.expense, 'findFirst').mockResolvedValue(null);

      await expect(getExpense('cju0123456789abcdef012399')).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('rejects unauthorized role from viewing expenses', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockPurchasing);

      await expect(getExpense('cju0123456789abcdef012399')).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  });

  describe('getUserExpenses', () => {
    it('returns formatted expenses submitted by current user', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      const mockList = [
        {
          id: 'cju0123456789abcdef012399',
          projectId: 'proj-1',
          budgetLineId: 'line-1',
          amount: new Prisma.Decimal('1200.00'),
          currency: 'SAR',
          description: 'شراء حديد إضافي',
          expenseDate: new Date('2026-03-01'),
          status: ExpenseStatus.DRAFT,
          submittedById: mockEngineer.id,
          submittedAt: null,
          approvedById: null,
          approvedAt: null,
          rejectedById: null,
          rejectedAt: null,
          rejectionReason: null,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
          submittedBy: { id: mockEngineer.id, name: mockEngineer.name, email: mockEngineer.email },
          approvedBy: null,
          rejectedBy: null,
          budgetLine: {
            id: 'line-1',
            category: BudgetCategory.MATERIALS,
            description: 'مواد بناء',
            amount: new Prisma.Decimal('50000.00'),
          },
          project: { id: 'proj-1', name: 'مشروع المستشفى', code: 'HOSP-01' },
        },
      ];

      vi.spyOn(prisma.expense, 'findMany').mockResolvedValue(mockList as unknown as ExpenseListRecord);

      const results = await getUserExpenses();
      expect(results).toHaveLength(1);
      expect(results[0]?.amount).toBe('1200.00');
    });
  });

  describe('getActiveProjectsForExpenses', () => {
    it('returns active projects with their approved budget lines for claimant', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockEngineer);

      const mockProjects = [
        {
          id: 'proj-1',
          name: 'مشروع المستشفى',
          code: 'HOSP-01',
          budgets: [
            {
              lines: [
                {
                  id: 'line-1',
                  category: BudgetCategory.MATERIALS,
                  description: 'مواد وتوريدات',
                  amount: new Prisma.Decimal('50000.00'),
                },
              ],
            },
          ],
        },
      ];

      vi.spyOn(prisma.project, 'findMany').mockResolvedValue(mockProjects as unknown as ProjectWithBudgetsList);

      const results = await getActiveProjectsForExpenses();
      expect(results).toHaveLength(1);
      expect(results[0]?.lines).toHaveLength(1);
      expect(results[0]?.lines[0]?.amount).toBe('50000.00');
    });

    it('rejects unauthorized role from accessing active project options', async () => {
      vi.spyOn(auth, 'requireAuth').mockResolvedValue(mockPurchasing);

      await expect(getActiveProjectsForExpenses()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  });
});
