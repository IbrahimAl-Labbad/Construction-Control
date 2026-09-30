/**
 * tests/integration/approvals-all-tab.test.ts
 *
 * All-tab triage integration tests against live PostgreSQL.
 * Verifies candidate pool guarantee, bounded window of 50 items,
 * and hasMoreBeyondWindow boolean flag.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { getAllTabTriage, ALL_TAB_DISPLAY_LIMIT } from '@/lib/approvals';
import * as authSession from '@/lib/auth/session';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Approvals All-Tab Triage — Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let projectId: string;
  let budgetLineId: string;

  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    const timestamp = Date.now();

    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير فرز الموافقات',
          email: `mgr.triage.${timestamp}@test.local`,
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

    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const project = await prisma.project.create({
      data: {
        code: `TRIAGE-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار فرز الكل',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    projectId = project.id;
    cleanupProjectIds.push(projectId);

    const budget = await prisma.budget.create({
      data: {
        projectId,
        version: 1,
        status: 'APPROVED',
        totalAmount: '500000.00',
        createdById: testManager.id,
        approvedById: testManager.id,
      },
    });

    const bLine = await prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        category: BudgetCategory.MATERIALS,
        description: 'بند فرز الكل',
        amount: '300000.00',
      },
    });
    budgetLineId = bLine.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (cleanupExpenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: cleanupExpenseIds } } });
    }
    if (cleanupCommitmentIds.length) {
      await prisma.commitment.deleteMany({ where: { id: { in: cleanupCommitmentIds } } });
    }

    for (const pId of cleanupProjectIds) {
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.project.deleteMany({ where: { id: pId } });
    }
  });

  it('guarantees candidate completeness: 50 older records in Domain A, 10 newer in Domain B -> all 50 output items come from Domain A', async () => {
    // Insert 50 expenses with earlier timestamps
    const baseTime = new Date('2026-09-01T00:00:00Z').getTime();

    for (let i = 0; i < 50; i++) {
      const exp = await prisma.expense.create({
        data: {
          projectId,
          budgetLineId,
          amount: '100.00',
          currency: 'SAR',
          description: `نفقة قديمة ${i}`,
          expenseDate: new Date(),
          status: 'SUBMITTED',
          submittedById: testManager.id,
          submittedAt: new Date(baseTime + i * 1000),
        },
      });
      cleanupExpenseIds.push(exp.id);
    }

    // Insert 10 commitments with later timestamps
    const laterTime = new Date('2026-09-02T00:00:00Z').getTime();
    for (let i = 0; i < 10; i++) {
      const com = await prisma.commitment.create({
        data: {
          projectId,
          budgetLineId,
          amount: '500.00',
          currency: 'SAR',
          vendorName: 'مورد لاحق',
          commitmentDate: new Date(),
          description: `ارتباط لاحق ${i}`,
          status: 'SUBMITTED',
          createdById: testManager.id,
          submittedById: testManager.id,
          submittedAt: new Date(laterTime + i * 1000),
        },
      });
      cleanupCommitmentIds.push(com.id);
    }

    const feed = await getAllTabTriage();

    // Must be capped at ALL_TAB_DISPLAY_LIMIT (50)
    expect(feed.items.length).toBe(ALL_TAB_DISPLAY_LIMIT);

    // Bounded window flag: counts.total is at least 60, items.length is 50
    expect(feed.counts.total).toBeGreaterThanOrEqual(60);
    expect(feed.hasMoreBeyondWindow).toBe(true);

    // All items must be the older ones (expenses)
    const returnedExpenseIds = feed.items
      .filter((i) => i.domain === 'EXPENSE')
      .map((i) => i.id);
    expect(returnedExpenseIds.length).toBe(50);
  });
});
