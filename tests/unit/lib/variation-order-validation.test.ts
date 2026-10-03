/**
 * tests/unit/lib/variation-order-validation.test.ts
 *
 * Unit tests for Variation Order Zod validation schemas (Slice 20).
 * Tests signed money amounts, quantities, unit rates, create/update payloads,
 * line item schemas, and lifecycle operation inputs.
 *
 * Follows AGENTS.md §13, §16, §20.
 */

import { describe, expect, it } from 'vitest';
import {
  signedMoneyAmountSchema,
  quantitySchema,
  unitRateSchema,
  createVariationOrderSchema,
  updateVariationOrderSchema,
  approveVariationOrderSchema,
  rejectVariationOrderSchema,
  reopenVariationOrderSchema,
  submitVariationOrderSchema,
} from '@/lib/validation/schemas/variation-order';

describe('Variation Order Zod Validation Schemas', () => {
  describe('signedMoneyAmountSchema', () => {
    it('accepts positive decimal strings', () => {
      expect(signedMoneyAmountSchema.safeParse('15000.50').success).toBe(true);
      expect(signedMoneyAmountSchema.safeParse('100').success).toBe(true);
    });

    it('accepts positive decimal strings with leading plus sign', () => {
      const res = signedMoneyAmountSchema.safeParse('+25000.75');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('25000.75');
      }
    });

    it('accepts negative decimal strings for omissions/deductions', () => {
      const res = signedMoneyAmountSchema.safeParse('-5420.50');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('-5420.50');
      }
    });

    it('accepts zero values', () => {
      expect(signedMoneyAmountSchema.safeParse('0.00').success).toBe(true);
      expect(signedMoneyAmountSchema.safeParse('0').success).toBe(true);
    });

    it('rejects more than 2 decimal places', () => {
      expect(signedMoneyAmountSchema.safeParse('100.555').success).toBe(false);
      expect(signedMoneyAmountSchema.safeParse('-100.123').success).toBe(false);
    });

    it('rejects non-numeric characters', () => {
      expect(signedMoneyAmountSchema.safeParse('abc').success).toBe(false);
      expect(signedMoneyAmountSchema.safeParse('100 SAR').success).toBe(false);
      expect(signedMoneyAmountSchema.safeParse('').success).toBe(false);
    });
  });

  describe('quantitySchema', () => {
    it('accepts positive decimals up to 4 decimal places', () => {
      expect(quantitySchema.safeParse('10').success).toBe(true);
      expect(quantitySchema.safeParse('10.5').success).toBe(true);
      expect(quantitySchema.safeParse('10.1234').success).toBe(true);
      expect(quantitySchema.safeParse('0').success).toBe(true);
    });

    it('rejects negative quantities', () => {
      expect(quantitySchema.safeParse('-5').success).toBe(false);
    });

    it('rejects more than 4 decimal places', () => {
      expect(quantitySchema.safeParse('10.12345').success).toBe(false);
    });
  });

  describe('unitRateSchema', () => {
    it('accepts positive unit rates up to 2 decimal places', () => {
      expect(unitRateSchema.safeParse('50.00').success).toBe(true);
      expect(unitRateSchema.safeParse('125.5').success).toBe(true);
      expect(unitRateSchema.safeParse('0').success).toBe(true);
    });

    it('rejects negative rates', () => {
      expect(unitRateSchema.safeParse('-50').success).toBe(false);
    });

    it('rejects more than 2 decimal places', () => {
      expect(unitRateSchema.safeParse('50.999').success).toBe(false);
    });
  });

  describe('createVariationOrderSchema', () => {
    const validProjectId = 'cjld2cjxh0000qzrmn831i7rn';
    const validBudgetLineId = 'cjld2cjxh0001qzrmn831i7rn';

    it('validates valid creation payload with line items', () => {
      const payload = {
        projectId: validProjectId,
        budgetLineId: validBudgetLineId,
        title: 'أعمال تسوية إضافية للموقع العام',
        description: 'إضافة أعمال حفر وردم وتسوية لقطاع الخدمات الشمالي',
        reason: 'توجيه الاستشاري وتعديل مناسيب الطرق المجاورة للمشروع',
        scopeImpact: 'زيادة مدة الأعمال الترابية بمقدار 4 أيام',
        lines: [
          {
            description: 'حفر في تربة صخرية',
            unit: 'م3',
            originalQuantity: '100',
            revisedQuantity: '250',
            originalRate: '45.00',
            revisedRate: '45.00',
            notes: 'أعمال إضافية وفق محضر الاجتماع الفني',
          },
        ],
      };

      const result = createVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('validates lump-sum variation without lines', () => {
      const payload = {
        projectId: validProjectId,
        title: 'مبلغ مقطوع لنقل محول كهربائي',
        description: 'نقل وتعديل موقع المحول بالتنسيق مع شركة الكهرباء',
        reason: 'تعارض الموقع القديم مع المدخل الرئيسي للمبنى',
        impactAmount: '35000.00',
        lines: [],
      };

      const result = createVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects missing or short title (< 3 chars)', () => {
      const payload = {
        projectId: validProjectId,
        title: 'أب',
        description: 'وصف كافي لأعمال التغيير المطلوبة',
        reason: 'مبرر فني صالح ومقبول للموقع',
      };

      const result = createVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects missing or short reason (< 5 chars)', () => {
      const payload = {
        projectId: validProjectId,
        title: 'عنوان أمر التغيير',
        description: 'وصف كافي لأعمال التغيير المطلوبة',
        reason: 'سبب',
      };

      const result = createVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid cuid format for projectId', () => {
      const payload = {
        projectId: 'invalid-id-format',
        title: 'عنوان أمر التغيير',
        description: 'وصف كافي لأعمال التغيير المطلوبة',
        reason: 'مبرر فني صالح ومقبول للموقع',
      };

      const result = createVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateVariationOrderSchema', () => {
    const validVoId = 'cjld2cjxh0000qzrmn831i7rn';
    const validBudgetLineId = 'cjld2cjxh0001qzrmn831i7rn';

    it('validates valid update payload with id', () => {
      const payload = {
        id: validVoId,
        budgetLineId: validBudgetLineId,
        title: 'تعديل مسار خطوط الصرف الصحي',
        description: 'تعديل المسار لتفادي الصخور الصلبة',
        reason: 'تقارير فحص التربة الميدانية المحدثة',
        scopeImpact: 'توفير يومين عمل',
        impactAmount: '12000.00',
        lines: [],
      };

      const result = updateVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects update payload with missing or invalid id', () => {
      const payload = {
        id: 'invalid-id',
        title: 'تعديل مسار خطوط الصرف الصحي',
        description: 'تعديل المسار لتفادي الصخور الصلبة',
        reason: 'تقارير فحص التربة الميدانية المحدثة',
      };

      const result = updateVariationOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Lifecycle Action Schemas', () => {
    const validVoId = 'cjld2cjxh0000qzrmn831i7rn';

    it('validates submitVariationOrderSchema', () => {
      expect(submitVariationOrderSchema.safeParse({ id: validVoId }).success).toBe(true);
      expect(submitVariationOrderSchema.safeParse({ id: 'invalid' }).success).toBe(false);
    });

    it('validates approveVariationOrderSchema', () => {
      expect(approveVariationOrderSchema.safeParse({ id: validVoId }).success).toBe(true);
      expect(approveVariationOrderSchema.safeParse({}).success).toBe(false);
    });

    it('validates rejectVariationOrderSchema requires mandatory reason', () => {
      expect(
        rejectVariationOrderSchema.safeParse({
          id: validVoId,
          rejectionReason: 'الأسعار مبالغ فيها ولا تتطابق مع أسعار السوق الحالية',
        }).success,
      ).toBe(true);

      // Rejection without reason fails
      expect(
        rejectVariationOrderSchema.safeParse({
          id: validVoId,
          rejectionReason: '',
        }).success,
      ).toBe(false);

      // Rejection with short reason fails
      expect(
        rejectVariationOrderSchema.safeParse({
          id: validVoId,
          rejectionReason: 'لا',
        }).success,
      ).toBe(false);
    });

    it('validates reopenVariationOrderSchema', () => {
      expect(reopenVariationOrderSchema.safeParse({ id: validVoId }).success).toBe(true);
    });
  });
});
