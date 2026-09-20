/**
 * tests/unit/lib/custody-validation.test.ts
 *
 * Unit tests for Custody Zod validation schemas.
 * Covers:
 * - custodyIdSchema (cuid, required)
 * - custodyPurposeSchema (min 10, max 1000, trim)
 * - expectedSettlementDateSchema (date parsing, optional/null)
 * - createCustodyDraftSchema & updateCustodyDraftSchema
 * - rejectCustodySchema (min 5, max 1000)
 * - cancelCustodySchema (min 10, max 1000)
 * - recordCashReturnSchema (money amount > 0, 2 decimals)
 * - expenseSchema custodyId integration
 */

import { describe, expect, it } from 'vitest';
import {
  custodyIdSchema,
  custodyPurposeSchema,
  expectedSettlementDateSchema,
  createCustodyDraftSchema,
  updateCustodyDraftSchema,
  rejectCustodySchema,
  cancelCustodySchema,
  recordCashReturnSchema,
} from '@/lib/validation/schemas/custody';
import { createExpenseDraftSchema } from '@/lib/validation/schemas/expense';

const VALID_CUID = 'clh1b2c3d000008l1g2h3i4j5';
const VALID_CUID_2 = 'clh1b2c3d000008l1g2h3i4j6';
const VALID_CUID_3 = 'clh1b2c3d000008l1g2h3i4j7';

describe('Custody Validation Schemas', () => {
  describe('custodyIdSchema', () => {
    it('accepts valid cuid', () => {
      const result = custodyIdSchema.safeParse(VALID_CUID);
      expect(result.success).toBe(true);
    });

    it('rejects invalid, non-cuid or empty string', () => {
      expect(custodyIdSchema.safeParse('').success).toBe(false);
      expect(custodyIdSchema.safeParse('not-a-cuid').success).toBe(false);
      expect(custodyIdSchema.safeParse(null).success).toBe(false);
      expect(custodyIdSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe('custodyPurposeSchema', () => {
    it('accepts valid operational purpose >= 10 chars', () => {
      const result = custodyPurposeSchema.safeParse('شراء مواد ومستلزمات تشغيلية للموقع');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('شراء مواد ومستلزمات تشغيلية للموقع');
      }
    });

    it('trims leading and trailing whitespace', () => {
      const result = custodyPurposeSchema.safeParse('   شراء مواد ومستلزمات تشغيلية للموقع   ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('شراء مواد ومستلزمات تشغيلية للموقع');
      }
    });

    it('rejects purpose shorter than 10 chars', () => {
      const result = custodyPurposeSchema.safeParse('قصير جدا');
      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace-only purpose', () => {
      expect(custodyPurposeSchema.safeParse('').success).toBe(false);
      expect(custodyPurposeSchema.safeParse('         ').success).toBe(false);
    });

    it('rejects purpose exceeding 1000 chars', () => {
      const longText = 'أ'.repeat(1001);
      expect(custodyPurposeSchema.safeParse(longText).success).toBe(false);
    });
  });

  describe('expectedSettlementDateSchema', () => {
    it('accepts valid Date instance', () => {
      const date = new Date('2026-10-15');
      const result = expectedSettlementDateSchema.safeParse(date);
      expect(result.success).toBe(true);
    });

    it('accepts valid date string and coerces to Date', () => {
      const result = expectedSettlementDateSchema.safeParse('2026-10-15');
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data).toBeInstanceOf(Date);
      }
    });

    it('accepts null, undefined, or empty string and coerces to null', () => {
      expect(expectedSettlementDateSchema.safeParse(null).data).toBeNull();
      expect(expectedSettlementDateSchema.safeParse(undefined).data).toBeNull();
      expect(expectedSettlementDateSchema.safeParse('').data).toBeNull();
      expect(expectedSettlementDateSchema.safeParse('   ').data).toBeNull();
    });
  });

  describe('createCustodyDraftSchema', () => {
    const validPayload = {
      projectId: VALID_CUID,
      budgetLineId: VALID_CUID_2,
      custodianUserId: VALID_CUID_3,
      amount: '5000.00',
      purpose: 'تغطية مصاريف طوارئ الموقع والضيافة',
      expectedSettlementDate: '2026-10-30',
    };

    it('validates a complete valid draft input', () => {
      const result = createCustodyDraftSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('accepts draft input with optional settlement date omitted', () => {
      const { expectedSettlementDate: _expectedSettlementDate, ...withoutDate } = validPayload;
      const result = createCustodyDraftSchema.safeParse(withoutDate);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative amount', () => {
      expect(createCustodyDraftSchema.safeParse({ ...validPayload, amount: '0' }).success).toBe(false);
      expect(createCustodyDraftSchema.safeParse({ ...validPayload, amount: '-100.00' }).success).toBe(false);
    });

    it('rejects non-cuid IDs', () => {
      expect(createCustodyDraftSchema.safeParse({ ...validPayload, projectId: 'invalid' }).success).toBe(false);
      expect(createCustodyDraftSchema.safeParse({ ...validPayload, budgetLineId: 'invalid' }).success).toBe(false);
      expect(createCustodyDraftSchema.safeParse({ ...validPayload, custodianUserId: 'invalid' }).success).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(createCustodyDraftSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('updateCustodyDraftSchema', () => {
    const validUpdatePayload = {
      id: VALID_CUID,
      budgetLineId: VALID_CUID_2,
      custodianUserId: VALID_CUID_3,
      amount: '7500.50',
      purpose: 'تحديث الغرض التشغيلي وتعديل المبلغ للعهدة',
      expectedSettlementDate: '2026-11-15',
    };

    it('accepts valid update input', () => {
      const result = updateCustodyDraftSchema.safeParse(validUpdatePayload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid custody id', () => {
      const result = updateCustodyDraftSchema.safeParse({ ...validUpdatePayload, id: 'bad-id' });
      expect(result.success).toBe(false);
    });
  });

  describe('rejectCustodySchema', () => {
    it('accepts valid rejection reason >= 5 chars', () => {
      const result = rejectCustodySchema.safeParse({
        id: VALID_CUID,
        rejectionReason: 'المبلغ غير مبرر تشغيلياً في هذه المرحلة',
      });
      expect(result.success).toBe(true);
    });

    it('rejects rejection reason < 5 chars', () => {
      const result = rejectCustodySchema.safeParse({
        id: VALID_CUID,
        rejectionReason: 'لا',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cancelCustodySchema (Pre-Issuance Cancellation)', () => {
    it('accepts valid cancellation reason >= 10 chars', () => {
      const result = cancelCustodySchema.safeParse({
        id: VALID_CUID,
        cancellationReason: 'تم إلغاء النشاط الميداني قبل صرف المبلغ للمهندس',
      });
      expect(result.success).toBe(true);
    });

    it('rejects cancellation reason < 10 chars', () => {
      const result = cancelCustodySchema.safeParse({
        id: VALID_CUID,
        cancellationReason: 'إلغاء فقط',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('recordCashReturnSchema', () => {
    it('accepts positive cash return amount with 2 decimal places', () => {
      const result = recordCashReturnSchema.safeParse({
        id: VALID_CUID,
        amount: '1250.75',
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative return amount', () => {
      expect(recordCashReturnSchema.safeParse({ id: VALID_CUID, amount: '0.00' }).success).toBe(false);
      expect(recordCashReturnSchema.safeParse({ id: VALID_CUID, amount: '-50.00' }).success).toBe(false);
    });
  });

  describe('Expense Schema custodyId integration', () => {
    it('accepts valid cuid for optional custodyId', () => {
      const result = createExpenseDraftSchema.safeParse({
        projectId: VALID_CUID,
        budgetLineId: VALID_CUID_2,
        amount: '350.00',
        expenseDate: '2026-09-15',
        description: 'فاتورة وقود للمولدات من العهدة التشغيلية',
        custodyId: VALID_CUID_3,
      });
      expect(result.success).toBe(true);
    });

    it('accepts omitted custodyId for direct project expenses', () => {
      const result = createExpenseDraftSchema.safeParse({
        projectId: VALID_CUID,
        budgetLineId: VALID_CUID_2,
        amount: '350.00',
        expenseDate: '2026-09-15',
        description: 'فاتورة وقود للمولدات مصروف مباشر',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.custodyId).toBeUndefined();
      }
    });

    it('rejects invalid string for custodyId', () => {
      const result = createExpenseDraftSchema.safeParse({
        projectId: VALID_CUID,
        budgetLineId: VALID_CUID_2,
        amount: '350.00',
        expenseDate: '2026-09-15',
        description: 'فاتورة وقود للمولدات من العهدة التشغيلية',
        custodyId: 'invalid-cuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
