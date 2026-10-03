/**
 * tests/unit/lib/variation-order-mappers.test.ts
 *
 * Unit tests for Variation Order DTO transformation mappers (Slice 20).
 * Verifies exact decimal string formatting, ISO date serialization,
 * and boundary safety.
 *
 * Follows AGENTS.md §13, §20, §26.
 */

import { describe, expect, it } from 'vitest';
import { Prisma, VariationOrderStatus } from '@prisma/client';
import {
  toVariationOrderLineDTO,
  toVariationOrderSummaryDTO,
  toVariationOrderDetailDTO,
  toProjectVariationsSummaryDTO,
  type VariationOrderLineRow,
  type VariationOrderQueryRow,
} from '@/lib/variation-orders/mappers';

describe('Variation Order Transformation Mappers', () => {
  describe('toVariationOrderLineDTO', () => {
    it('formats numbers and Decimals to 2-decimal strings', () => {
      const lineRow: VariationOrderLineRow = {
        id: 'line-1',
        description: 'بند حفر إضافي',
        unit: 'م3',
        originalQuantity: new Prisma.Decimal('100.5'),
        revisedQuantity: new Prisma.Decimal('150.75'),
        quantityDelta: new Prisma.Decimal('50.25'),
        originalRate: new Prisma.Decimal('60'),
        revisedRate: new Prisma.Decimal('60.00'),
        financialDelta: new Prisma.Decimal('3015.00'),
        notes: 'ملاحظة',
      };

      const dto = toVariationOrderLineDTO(lineRow);

      expect(dto).toEqual({
        id: 'line-1',
        description: 'بند حفر إضافي',
        unit: 'م3',
        originalQuantity: '100.50',
        revisedQuantity: '150.75',
        quantityDelta: '50.25',
        originalRate: '60.00',
        revisedRate: '60.00',
        financialDelta: '3015.00',
        notes: 'ملاحظة',
      });
    });
  });

  describe('toVariationOrderSummaryDTO', () => {
    it('maps query row to VariationOrderSummaryDTO with exact formatting', () => {
      const row: VariationOrderQueryRow = {
        id: 'vo-1',
        orderNumber: 'VO-PRJ01-001',
        projectId: 'proj-1',
        project: { code: 'PRJ01', name: 'مشروع الأبراج السكنية' },
        budgetLineId: 'bline-1',
        budgetLine: { category: 'SITE_WORK', description: 'أعمال الموقع العام' },
        commitmentId: 'comm-1',
        commitment: { vendorName: 'شركة المقاولات الحديثة', referenceNumber: 'PO-2026-001' },
        title: 'تعديل مسارات الصرف الصحي',
        description: 'أعمال إضافية لتعديل مسارات خطوط الصرف',
        reason: 'توجيه هندسي من الأمانة',
        scopeImpact: 'تأخير أعمال الموقع العام 3 أيام',
        status: VariationOrderStatus.APPROVED,
        impactAmount: new Prisma.Decimal('45000.00'),
        currency: 'SAR',
        createdById: 'user-eng',
        createdBy: { name: 'المهندس أحمد' },
        submittedById: 'user-eng',
        submittedBy: { name: 'المهندس أحمد' },
        submittedAt: new Date('2026-10-01T10:00:00.000Z'),
        approvedById: 'user-mgr',
        approvedBy: { name: 'المدير العام' },
        approvedAt: new Date('2026-10-02T12:00:00.000Z'),
        rejectedById: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
        updatedAt: new Date('2026-10-01T08:00:00.000Z'),
        _count: { lines: 3 },
      };

      const dto = toVariationOrderSummaryDTO(row);

      expect(dto.orderNumber).toBe('VO-PRJ01-001');
      expect(dto.projectName).toBe('مشروع الأبراج السكنية');
      expect(dto.projectCode).toBe('PRJ01');
      expect(dto.budgetLineCategory).toBe('SITE_WORK');
      expect(dto.commitmentVendorName).toBe('شركة المقاولات الحديثة');
      expect(dto.commitmentReference).toBe('PO-2026-001');
      expect(dto.status).toBe(VariationOrderStatus.APPROVED);
      expect(dto.impactAmount).toBe('45000.00');
      expect(dto.currency).toBe('SAR');
      expect(dto.createdByName).toBe('المهندس أحمد');
      expect(dto.approvedByName).toBe('المدير العام');
      expect(dto.approvedAt).toBe('2026-10-02T12:00:00.000Z');
      expect(dto.linesCount).toBe(3);
    });
  });

  describe('toVariationOrderDetailDTO', () => {
    it('includes mapped lines array in detail DTO', () => {
      const row: VariationOrderQueryRow = {
        id: 'vo-1',
        orderNumber: 'VO-PRJ01-001',
        projectId: 'proj-1',
        project: { code: 'PRJ01', name: 'مشروع الأبراج' },
        budgetLineId: null,
        commitmentId: null,
        title: 'أمر تغيير',
        description: 'وصف',
        reason: 'سبب',
        scopeImpact: null,
        status: VariationOrderStatus.DRAFT,
        impactAmount: new Prisma.Decimal('12000.00'),
        currency: 'SAR',
        createdById: 'user-eng',
        createdBy: { name: 'المهندس أحمد' },
        submittedById: null,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
        updatedAt: new Date('2026-10-01T08:00:00.000Z'),
        lines: [
          {
            id: 'line-1',
            description: 'بند 1',
            unit: 'م2',
            originalQuantity: new Prisma.Decimal('10'),
            revisedQuantity: new Prisma.Decimal('20'),
            quantityDelta: new Prisma.Decimal('10'),
            originalRate: new Prisma.Decimal('1200'),
            revisedRate: new Prisma.Decimal('1200'),
            financialDelta: new Prisma.Decimal('12000'),
            notes: null,
          },
        ],
      };

      const dto = toVariationOrderDetailDTO(row);

      expect(dto.lines).toHaveLength(1);
      expect(dto.lines[0]?.financialDelta).toBe('12000.00');
      expect(dto.linesCount).toBe(1);
    });
  });

  describe('toProjectVariationsSummaryDTO', () => {
    it('converts calculation result Decimals to formatted DTO strings', () => {
      const result = {
        originalBudget: new Prisma.Decimal('1000000.00'),
        approvedVariationsTotal: new Prisma.Decimal('75000.50'),
        revisedApprovedBudget: new Prisma.Decimal('1075000.50'),
        pendingVariationsTotal: new Prisma.Decimal('25000.00'),
        projectedBudget: new Prisma.Decimal('1100000.50'),
        draftVariationsTotal: new Prisma.Decimal('0.00'),
        rejectedVariationsTotal: new Prisma.Decimal('0.00'),
        totalApprovedIncreases: new Prisma.Decimal('85000.50'),
        totalApprovedDecreases: new Prisma.Decimal('10000.00'),
        counts: {
          draft: 2,
          submitted: 1,
          approved: 3,
          rejected: 1,
          total: 7,
        },
      };

      const dto = toProjectVariationsSummaryDTO(result);

      expect(dto.originalBudget).toBe('1000000.00');
      expect(dto.approvedVariationsTotal).toBe('75000.50');
      expect(dto.revisedApprovedBudget).toBe('1075000.50');
      expect(dto.pendingVariationsTotal).toBe('25000.00');
      expect(dto.projectedBudget).toBe('1100000.50');
      expect(dto.totalApprovedIncreases).toBe('85000.50');
      expect(dto.totalApprovedDecreases).toBe('10000.00');
      expect(dto.counts.approved).toBe(3);
    });
  });
});
