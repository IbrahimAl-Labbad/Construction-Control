/**
 * tests/unit/lib/budget-mappers.test.ts
 *
 * Unit tests for Budget DTO mappers:
 * - toBudgetSummaryDTO
 * - toBudgetDetailsDTO
 *
 * Verifies AGENTS.md §13 (Monetary rules - no Decimals or Floats exposed)
 * and §26 (Client/Server boundary serialization).
 */

import { describe, expect, it } from 'vitest';
import { BudgetStatus, BudgetCategory, Prisma } from '@prisma/client';

import { toBudgetSummaryDTO, toBudgetDetailsDTO } from '@/lib/budget/mappers';

describe('Budget DTO Mappers', () => {
  const mockEntity = {
    id: 'budget-123',
    projectId: 'proj-456',
    version: 1,
    status: BudgetStatus.DRAFT,
    totalAmount: new Prisma.Decimal('125000.50'),
    currency: 'SAR',
    notes: 'ملاحظات الموازنة',
    createdById: 'user-1',
    createdBy: {
      id: 'user-1',
      name: 'مهندس أحمد',
      email: 'ahmed@test.local',
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
        budgetId: 'budget-123',
        category: BudgetCategory.MATERIALS,
        description: 'حديد تسليح',
        amount: new Prisma.Decimal('75000.00'),
        createdAt: new Date('2026-09-15T10:00:00Z'),
        updatedAt: new Date('2026-09-15T10:00:00Z'),
      },
      {
        id: 'line-2',
        budgetId: 'budget-123',
        category: BudgetCategory.LABOR,
        description: 'أجور حدادين ونجارين',
        amount: new Prisma.Decimal('50000.50'),
        createdAt: new Date('2026-09-15T10:00:00Z'),
        updatedAt: new Date('2026-09-15T10:00:00Z'),
      },
    ],
  };

  describe('toBudgetSummaryDTO', () => {
    it('serializes totalAmount as a 2-decimal string', () => {
      const summary = toBudgetSummaryDTO(mockEntity);
      expect(typeof summary.totalAmount).toBe('string');
      expect(summary.totalAmount).toBe('125000.50');
    });

    it('derives lineCount accurately from lines array', () => {
      const summary = toBudgetSummaryDTO(mockEntity);
      expect(summary.lineCount).toBe(2);
    });

    it('derives lineCount accurately from _count relation when lines not fetched', () => {
      const entityWithoutLines = {
        ...mockEntity,
        lines: undefined,
        _count: { lines: 5 },
      };
      const summary = toBudgetSummaryDTO(entityWithoutLines);
      expect(summary.lineCount).toBe(5);
    });

    it('maps approvedBy to null when not approved', () => {
      const summary = toBudgetSummaryDTO(mockEntity);
      expect(summary.approvedBy).toBeNull();
      expect(summary.approvedById).toBeNull();
    });

    it('maps approvedBy details when present', () => {
      const approvedEntity = {
        ...mockEntity,
        status: BudgetStatus.APPROVED,
        approvedById: 'manager-1',
        approvedBy: {
          id: 'manager-1',
          name: 'المدير التنفيذي',
          email: 'manager@test.local',
        },
        approvedAt: new Date('2026-09-15T12:00:00Z'),
      };
      const summary = toBudgetSummaryDTO(approvedEntity);
      expect(summary.approvedBy).toEqual({
        id: 'manager-1',
        name: 'المدير التنفيذي',
        email: 'manager@test.local',
      });
      expect(summary.approvedById).toBe('manager-1');
      expect(summary.approvedAt).toBeInstanceOf(Date);
    });
  });

  describe('toBudgetDetailsDTO', () => {
    it('includes all lines serialized with string amounts', () => {
      const details = toBudgetDetailsDTO(mockEntity);
      expect(details.lines).toHaveLength(2);

      expect(typeof details.lines[0]?.amount).toBe('string');
      expect(details.lines[0]?.amount).toBe('75000.00');
      expect(details.lines[0]?.category).toBe(BudgetCategory.MATERIALS);

      expect(typeof details.lines[1]?.amount).toBe('string');
      expect(details.lines[1]?.amount).toBe('50000.50');
      expect(details.lines[1]?.category).toBe(BudgetCategory.LABOR);
    });

    it('returns empty lines array when lines are undefined', () => {
      const entityNoLines = {
        ...mockEntity,
        lines: undefined,
      };
      const details = toBudgetDetailsDTO(entityNoLines);
      expect(details.lines).toEqual([]);
    });
  });
});
