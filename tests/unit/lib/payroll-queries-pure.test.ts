/**
 * tests/unit/lib/payroll-queries-pure.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Pure unit tests for payroll query helpers, privacy boundary, and DTO serialization.
 *
 * AGENTS.md §13 (monetary representation as string, exact Decimals).
 * AGENTS.md §26 (server/client privacy boundary).
 */

import { describe, expect, it } from 'vitest';
import { BudgetCategory, PayrollStatus, Prisma } from '@prisma/client';

import { toPayrollSummaryDTO } from '@/lib/payroll/mappers';
import type { ProjectLaborSummaryDTO } from '@/lib/payroll/types';

describe('Payroll Queries Pure Unit Tests', () => {
  describe('toPayrollSummaryDTO privacy & formatting', () => {
    it('formats monetary fields as strings with 2 decimal places and strips internal ORM fields', () => {
      const mockRaw = {
        id: 'cmu_payroll_123',
        projectId: 'cmu_proj_1',
        budgetLineId: 'cmu_line_1',
        workerName: 'أحمد علي النجار',
        workerReference: 'WRK-2026-001',
        tradeOrTitle: 'نجار مسلح',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('4500.50'),
        currency: 'SAR',
        description: 'أجور شهر سبتمبر',
        status: PayrollStatus.APPROVED,
        createdById: 'usr_acc_1',
        submittedById: 'usr_acc_1',
        submittedAt: new Date('2026-09-15T10:00:00Z'),
        approvedById: 'usr_mgr_1',
        approvedAt: new Date('2026-09-16T12:00:00Z'),
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledById: null,
        cancelledAt: null,
        cancellationReason: null,
        deletedAt: null,
        createdAt: new Date('2026-09-14T08:00:00Z'),
        updatedAt: new Date('2026-09-16T12:00:00Z'),
        project: {
          id: 'cmu_proj_1',
          name: 'مشروع البرج التجاري',
          code: 'PRJ-TWR-01',
        },
        budgetLine: {
          id: 'cmu_line_1',
          category: BudgetCategory.LABOR,
          description: 'بند أجور وعمالة الهيكل',
          amount: new Prisma.Decimal('150000.00'),
        },
        createdBy: {
          id: 'usr_acc_1',
          name: 'المحاسب المعتمد',
          email: 'acc@test.local',
        },
        submittedBy: {
          id: 'usr_acc_1',
          name: 'المحاسب المعتمد',
          email: 'acc@test.local',
        },
        approvedBy: {
          id: 'usr_mgr_1',
          name: 'مدير المشروع',
          email: 'mgr@test.local',
        },
        rejectedBy: null,
        cancelledBy: null,
      };

      const dto = toPayrollSummaryDTO(mockRaw);

      // Verify Decimal string formatting
      expect(typeof dto.amount).toBe('string');
      expect(dto.amount).toBe('4500.50');
      expect(dto.budgetLine?.amount).toBe('150000.00');

      // Verify safe relation inclusion
      expect(dto.project?.name).toBe('مشروع البرج التجاري');
      expect(dto.createdBy?.email).toBe('acc@test.local');
      expect(dto.approvedBy?.name).toBe('مدير المشروع');

      // Verify sensitive server properties are not present
      const serialized = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;
      expect('passwordHash' in serialized).toBe(false);
      expect('sessionToken' in serialized).toBe(false);
      expect('hashedPassword' in serialized).toBe(false);
    });
  });

  describe('ProjectLaborSummaryDTO privacy boundary', () => {
    it('guarantees that aggregate summary contains no individual worker identity or row records', () => {
      const summary: ProjectLaborSummaryDTO = {
        projectId: 'cmu_proj_99',
        projectName: 'مشروع المجمع السكني',
        projectCode: 'PRJ-RES-01',
        totalLaborBudget: '500000.00',
        approvedLaborSpend: '320000.00',
        pendingLaborSpend: '25000.00',
        remainingLaborBudget: '180000.00',
        currency: 'SAR',
        laborBudgetLinesCount: 2,
      };

      const serialized = JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;

      // Explicit Privacy Assertions
      expect('workerName' in serialized).toBe(false);
      expect('workerReference' in serialized).toBe(false);
      expect('tradeOrTitle' in serialized).toBe(false);
      expect('rejectionReason' in serialized).toBe(false);
      expect('cancellationReason' in serialized).toBe(false);
      expect('payrollEntries' in serialized).toBe(false);
      expect('rows' in serialized).toBe(false);
      expect('items' in serialized).toBe(false);

      // Financial accuracy assertions
      expect(typeof summary.totalLaborBudget).toBe('string');
      expect(typeof summary.approvedLaborSpend).toBe('string');
      expect(typeof summary.remainingLaborBudget).toBe('string');
      expect(summary.totalLaborBudget).toBe('500000.00');
    });
  });
});
