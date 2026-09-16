/**
 * tests/unit/lib/budget-validation.test.ts
 *
 * Unit tests for Project Budget Zod validation schemas:
 * - moneyAmountSchema
 * - budgetLineInputSchema
 * - createBudgetDraftSchema
 * - updateBudgetDraftSchema
 * - rejectBudgetSchema
 *
 * Verifies AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 */

import { describe, expect, it } from 'vitest';
import { BudgetCategory } from '@prisma/client';

import {
  moneyAmountSchema,
  budgetLineInputSchema,
  createBudgetDraftSchema,
  updateBudgetDraftSchema,
  rejectBudgetSchema,
} from '@/lib/validation/schemas/budget';
import { validate } from '@/lib/validation';

describe('Budget Validation Schemas', () => {
  // =========================================================================
  // moneyAmountSchema
  // =========================================================================
  describe('moneyAmountSchema', () => {
    it('accepts valid integer amounts as string', () => {
      const result = moneyAmountSchema.safeParse('1000');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('1000');
    });

    it('accepts valid decimal amounts with 1 or 2 decimal places', () => {
      expect(moneyAmountSchema.safeParse('1500.5').success).toBe(true);
      expect(moneyAmountSchema.safeParse('1500.75').success).toBe(true);
      expect(moneyAmountSchema.safeParse('0.05').success).toBe(true);
      expect(moneyAmountSchema.safeParse('0.5').success).toBe(true);
    });

    it('accepts valid number inputs via preprocessing', () => {
      const result = moneyAmountSchema.safeParse(2500.5);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('2500.5');
    });

    it('trims leading and trailing whitespace', () => {
      const result = moneyAmountSchema.safeParse('  3500.00  ');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('3500.00');
    });

    it('rejects empty or whitespace-only inputs', () => {
      expect(moneyAmountSchema.safeParse('').success).toBe(false);
      expect(moneyAmountSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects zero amounts (both 0 and 0.00)', () => {
      expect(moneyAmountSchema.safeParse('0').success).toBe(false);
      expect(moneyAmountSchema.safeParse('0.0').success).toBe(false);
      expect(moneyAmountSchema.safeParse('0.00').success).toBe(false);
      expect(moneyAmountSchema.safeParse(0).success).toBe(false);
    });

    it('rejects negative amounts', () => {
      expect(moneyAmountSchema.safeParse('-100').success).toBe(false);
      expect(moneyAmountSchema.safeParse('-0.01').success).toBe(false);
      expect(moneyAmountSchema.safeParse(-50).success).toBe(false);
    });

    it('rejects more than 2 decimal places', () => {
      expect(moneyAmountSchema.safeParse('100.123').success).toBe(false);
      expect(moneyAmountSchema.safeParse('50.9999').success).toBe(false);
    });

    it('rejects non-numeric characters', () => {
      expect(moneyAmountSchema.safeParse('100SAR').success).toBe(false);
      expect(moneyAmountSchema.safeParse('abc').success).toBe(false);
      expect(moneyAmountSchema.safeParse('1,000.00').success).toBe(false);
      expect(moneyAmountSchema.safeParse('10.0.0').success).toBe(false);
    });
  });

  // =========================================================================
  // budgetLineInputSchema
  // =========================================================================
  describe('budgetLineInputSchema', () => {
    it('accepts valid line input', () => {
      const valid = {
        category: BudgetCategory.MATERIALS,
        description: 'شراء حديد تسليح عالي المقاومة',
        amount: '45000.00',
      };
      const result = budgetLineInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid category', () => {
      const invalid = {
        category: 'INVALID_CATEGORY',
        description: 'بند غير صالح',
        amount: '1000',
      };
      expect(budgetLineInputSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects description shorter than 3 characters', () => {
      const invalid = {
        category: BudgetCategory.LABOR,
        description: 'أج',
        amount: '1000',
      };
      expect(budgetLineInputSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects description longer than 500 characters', () => {
      const invalid = {
        category: BudgetCategory.EQUIPMENT,
        description: 'أ'.repeat(501),
        amount: '1000',
      };
      expect(budgetLineInputSchema.safeParse(invalid).success).toBe(false);
    });
  });

  // =========================================================================
  // createBudgetDraftSchema
  // =========================================================================
  describe('createBudgetDraftSchema', () => {
    const validProjectId = 'clh0000000000000000000001';

    it('accepts valid create payload', () => {
      const payload = {
        projectId: validProjectId,
        notes: 'ملاحظات الموازنة المبدئية',
        lines: [
          {
            category: BudgetCategory.MATERIALS,
            description: 'توريد خرسانة جاهزة',
            amount: '50000.00',
          },
          {
            category: BudgetCategory.LABOR,
            description: 'أجور عمالة تنفيذ الهيكل',
            amount: '20000.00',
          },
        ],
      };
      const result = validate(createBudgetDraftSchema, payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty lines array', () => {
      const payload = {
        projectId: validProjectId,
        lines: [],
      };
      const result = validate(createBudgetDraftSchema, payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.path === 'lines')).toBe(true);
      }
    });

    it('rejects invalid project ID format (not CUID)', () => {
      const payload = {
        projectId: 'not-a-cuid',
        lines: [
          {
            category: BudgetCategory.MATERIALS,
            description: 'بند تجريبي',
            amount: '100',
          },
        ],
      };
      const result = validate(createBudgetDraftSchema, payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.path === 'projectId')).toBe(true);
      }
    });

    it('handles whitespace-only notes as null', () => {
      const payload = {
        projectId: validProjectId,
        notes: '   ',
        lines: [
          {
            category: BudgetCategory.SUBCONTRACTOR,
            description: 'مقاول باطن للأعمال الكهربائية',
            amount: '35000.00',
          },
        ],
      };
      const result = validate(createBudgetDraftSchema, payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notes).toBeNull();
      }
    });
  });

  // =========================================================================
  // updateBudgetDraftSchema
  // =========================================================================
  describe('updateBudgetDraftSchema', () => {
    it('accepts valid update payload', () => {
      const payload = {
        notes: 'تعديل بنود الموازنة',
        lines: [
          {
            category: BudgetCategory.EQUIPMENT,
            description: 'إيجار مضخة خرسانة',
            amount: '8500.00',
          },
        ],
      };
      const result = validate(updateBudgetDraftSchema, payload);
      expect(result.success).toBe(true);
    });

    it('rejects update payload with empty lines', () => {
      const payload = {
        lines: [],
      };
      const result = validate(updateBudgetDraftSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // rejectBudgetSchema
  // =========================================================================
  describe('rejectBudgetSchema', () => {
    it('accepts valid rejection reason', () => {
      const result = validate(rejectBudgetSchema, {
        rejectionReason: 'التكلفة التقديرية لبند المواد مبالغ فيها',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty or whitespace rejection reason', () => {
      expect(validate(rejectBudgetSchema, { rejectionReason: '' }).success).toBe(false);
      expect(validate(rejectBudgetSchema, { rejectionReason: '   ' }).success).toBe(false);
    });

    it('rejects rejection reason under 3 characters', () => {
      expect(validate(rejectBudgetSchema, { rejectionReason: 'لا' }).success).toBe(false);
    });

    it('rejects rejection reason over 500 characters', () => {
      expect(
        validate(rejectBudgetSchema, { rejectionReason: 'س'.repeat(501) }).success,
      ).toBe(false);
    });
  });
});
