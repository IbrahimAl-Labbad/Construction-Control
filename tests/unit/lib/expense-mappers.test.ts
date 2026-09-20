/**
 * tests/unit/lib/expense-mappers.test.ts
 *
 * Unit tests for Expense DTO mappers.
 * Proves Decimal to string conversion and relation transformations.
 */

import { describe, it, expect } from 'vitest';
import { ExpenseStatus, BudgetCategory, Prisma } from '@prisma/client';
import { toExpenseSummaryDTO, type ExpenseWithRelations } from '@/lib/expenses/mappers';

describe('toExpenseSummaryDTO', () => {
  const baseEntity: ExpenseWithRelations = {
    id: 'exp-123',
    projectId: 'proj-456',
    budgetLineId: 'line-789',
    custodyId: null,
    amount: new Prisma.Decimal('1450.50'),
    currency: 'SAR',
    description: 'توريد أدوات حفر',
    expenseDate: new Date('2026-03-15T10:00:00Z'),
    status: ExpenseStatus.DRAFT,
    submittedById: 'user-eng',
    submittedBy: {
      id: 'user-eng',
      name: 'م. أحمد مهندس الموقع',
      email: 'engineer@example.com',
    },
    submittedAt: null,
    approvedById: null,
    approvedBy: null,
    approvedAt: null,
    rejectedById: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-03-15T10:00:00Z'),
    updatedAt: new Date('2026-03-15T10:00:00Z'),
    project: {
      id: 'proj-456',
      name: 'مشروع برج الرياض',
      code: 'PRJ-RYD-01',
    },
    budgetLine: {
      id: 'line-789',
      category: BudgetCategory.EQUIPMENT,
      description: 'إيجار معدات ثقيلة',
      amount: new Prisma.Decimal('50000.00'),
    },
  };

  it('serializes Prisma Decimal amount strictly to 2-decimal string', () => {
    const dto = toExpenseSummaryDTO(baseEntity);
    expect(dto.amount).toBe('1450.50');
    expect(typeof dto.amount).toBe('string');
  });

  it('maps budget line info and formatted authorized amount', () => {
    const dto = toExpenseSummaryDTO(baseEntity);
    expect(dto.budgetLine).toBeDefined();
    expect(dto.budgetLine?.category).toBe('EQUIPMENT');
    expect(dto.budgetLine?.amount).toBe('50000.00');
  });

  it('maps submitter information', () => {
    const dto = toExpenseSummaryDTO(baseEntity);
    expect(dto.submittedBy.id).toBe('user-eng');
    expect(dto.submittedBy.name).toBe('م. أحمد مهندس الموقع');
  });

  it('maps approved metadata when present', () => {
    const approvedEntity: ExpenseWithRelations = {
      ...baseEntity,
      status: ExpenseStatus.APPROVED,
      approvedById: 'mgr-1',
      approvedBy: { id: 'mgr-1', name: 'المدير العام', email: 'manager@example.com' },
      approvedAt: new Date('2026-03-16T12:00:00Z'),
    };

    const dto = toExpenseSummaryDTO(approvedEntity);
    expect(dto.status).toBe('APPROVED');
    expect(dto.approvedBy?.name).toBe('المدير العام');
    expect(dto.approvedAt).toBeInstanceOf(Date);
  });

  it('maps rejected metadata when present (explicit rejection tracking)', () => {
    const rejectedEntity: ExpenseWithRelations = {
      ...baseEntity,
      status: ExpenseStatus.REJECTED,
      rejectedById: 'mgr-1',
      rejectedBy: { id: 'mgr-1', name: 'المدير العام', email: 'manager@example.com' },
      rejectedAt: new Date('2026-03-16T12:00:00Z'),
      rejectionReason: 'السعر غير متوافق مع الأسعار المتفق عليها',
    };

    const dto = toExpenseSummaryDTO(rejectedEntity);
    expect(dto.status).toBe('REJECTED');
    expect(dto.rejectedBy?.name).toBe('المدير العام');
    expect(dto.rejectionReason).toBe('السعر غير متوافق مع الأسعار المتفق عليها');
    expect(dto.approvedBy).toBeNull();
  });
});
