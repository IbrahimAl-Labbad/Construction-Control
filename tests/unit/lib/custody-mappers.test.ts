/**
 * tests/unit/lib/custody-mappers.test.ts
 *
 * Unit tests for Custody record to DTO mapping functions.
 * Ensures Decimal to formatted string conversion and safe null/relation handling.
 */

import { describe, expect, it } from 'vitest';
import { BudgetCategory, CustodyStatus, ExpenseStatus, Prisma } from '@prisma/client';
import { toCustodySummaryDTO, toCustodyDetailDTO } from '@/lib/custodies/mappers';

describe('Custody Mappers', () => {
  const mockCustodian = {
    id: 'user-eng-1',
    name: 'مهندس الموقع',
    email: 'eng1@test.local',
  };

  const mockCreator = {
    id: 'user-acc-1',
    name: 'المحاسب',
    email: 'acc1@test.local',
  };

  const mockBaseCustody = {
    id: 'cust-123',
    code: 'CUST-001',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'مشروع البرج', code: 'PRJ-BRG' },
    budgetLineId: 'line-1',
    budgetLine: {
      id: 'line-1',
      category: BudgetCategory.SITE_OPERATIONS,
      description: 'مصاريف موقع',
      amount: new Prisma.Decimal('50000.00'),
    },
    custodianUserId: mockCustodian.id,
    custodian: mockCustodian,
    amount: new Prisma.Decimal('10000.00'),
    currency: 'SAR',
    purpose: 'تغطية مصاريف الموقع الطارئة والوقود',
    status: CustodyStatus.ISSUED,
    cashReturnedAmount: new Prisma.Decimal('1500.00'),
    createdById: mockCreator.id,
    createdBy: mockCreator,
    submittedById: mockCustodian.id,
    submittedBy: mockCustodian,
    submittedAt: new Date('2026-09-10T10:00:00Z'),
    approvedById: 'user-mgr-1',
    approvedBy: { id: 'user-mgr-1', name: 'المدير', email: 'mgr@test.local' },
    approvedAt: new Date('2026-09-11T12:00:00Z'),
    rejectedById: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledById: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    issuedById: 'user-acc-1',
    issuedBy: mockCreator,
    issuedAt: new Date('2026-09-12T09:00:00Z'),
    settledAt: null,
    closedById: null,
    closedBy: null,
    closedAt: null,
    expectedSettlementDate: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-09-10T08:00:00Z'),
    updatedAt: new Date('2026-09-12T09:00:00Z'),
    expenses: [
      {
        id: 'exp-1',
        amount: new Prisma.Decimal('3500.00'),
        status: ExpenseStatus.APPROVED,
        description: 'فاتورة ديزل للمعدات',
        expenseDate: new Date('2026-09-13T00:00:00Z'),
        submittedBy: mockCustodian,
        approvedAt: new Date('2026-09-14T00:00:00Z'),
        deletedAt: null,
      },
      {
        id: 'exp-2',
        amount: new Prisma.Decimal('1000.00'),
        status: ExpenseStatus.SUBMITTED,
        description: 'شراء عدد وأدوات يدوية',
        expenseDate: new Date('2026-09-15T00:00:00Z'),
        submittedBy: mockCustodian,
        approvedAt: null,
        deletedAt: null,
      },
      {
        id: 'exp-deleted',
        amount: new Prisma.Decimal('2000.00'),
        status: ExpenseStatus.APPROVED,
        description: 'مصروف ملغي',
        deletedAt: new Date(),
      },
    ],
  };

  describe('toCustodySummaryDTO', () => {
    it('correctly maps prisma custody into safe summary DTO with calculated balances', () => {
      const dto = toCustodySummaryDTO(mockBaseCustody);

      expect(dto.id).toBe('cust-123');
      expect(dto.code).toBe('CUST-001');
      expect(dto.amount).toBe('10000.00');
      expect(dto.settledExpensesAmount).toBe('3500.00'); // exp-1 approved only, exp-deleted excluded
      expect(dto.cashReturnedAmount).toBe('1500.00');
      // remainingBalance = 10,000 - 3,500 - 1,500 = 5,000.00
      expect(dto.remainingBalance).toBe('5000.00');
      // availableToClaim = 5,000 - 1,000 (pending exp-2) = 4,000.00
      expect(dto.availableToClaim).toBe('4000.00');

      expect(dto.custodian.name).toBe('مهندس الموقع');
      expect(dto.createdBy.name).toBe('المحاسب');
      expect(dto.approvedBy?.name).toBe('المدير');
      expect(dto.issuedBy?.name).toBe('المحاسب');
      expect(dto.rejectedBy).toBeNull();
      expect(dto.cancelledBy).toBeNull();
      expect(dto.closedBy).toBeNull();
      expect(dto.expensesCount).toBe(2); // non-deleted count
    });

    it('gracefully handles missing optional relations', () => {
      const minimalCustody = {
        ...mockBaseCustody,
        project: null,
        budgetLine: null,
        submittedBy: null,
        approvedBy: null,
        issuedBy: null,
        expenses: [],
      };

      const dto = toCustodySummaryDTO(minimalCustody);
      expect(dto.project).toBeUndefined();
      expect(dto.budgetLine).toBeUndefined();
      expect(dto.submittedBy).toBeNull();
      expect(dto.approvedBy).toBeNull();
      expect(dto.settledExpensesAmount).toBe('0.00');
      expect(dto.remainingBalance).toBe('8500.00'); // 10,000 - 1,500 cash return
    });
  });

  describe('toCustodyDetailDTO', () => {
    it('includes mapped expenses list filtering out soft-deleted records', () => {
      const detailDto = toCustodyDetailDTO(mockBaseCustody);

      expect(detailDto.expenses).toHaveLength(2);
      expect(detailDto.expenses![0]!.id).toBe('exp-1');
      expect(detailDto.expenses![0]!.amount).toBe('3500.00');
      expect(detailDto.expenses![0]!.description).toBe('فاتورة ديزل للمعدات');
      expect(detailDto.expenses![1]!.id).toBe('exp-2');
      expect(detailDto.expenses![1]!.amount).toBe('1000.00');
    });
  });
});
