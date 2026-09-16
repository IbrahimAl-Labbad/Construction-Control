/**
 * tests/unit/lib/commitment-validation.test.ts
 *
 * Unit tests for Commitment Zod validation schemas.
 * Covers:
 * - referenceNumber normalization (Correction 2: empty/whitespace -> null, trim, <= 100)
 * - vendorName validation (2-150 chars)
 * - moneyAmountSchema (positives, 2 decimals, rejects 0 and negatives)
 * - commitmentDateSchema (validates date, rejects future dates beyond 1 day)
 * - createCommitmentDraftSchema, updateCommitmentDraftSchema, rejectCommitmentSchema
 */

import { describe, expect, it } from 'vitest';

import {
  commitmentIdSchema,
  referenceNumberSchema,
  vendorNameSchema,
  commitmentDateSchema,
  createCommitmentDraftSchema,
  updateCommitmentDraftSchema,
  rejectCommitmentSchema,
} from '@/lib/validation/schemas/commitment';

describe('Commitment Validation Schemas', () => {
  describe('commitmentIdSchema', () => {
    it('accepts valid cuid', () => {
      const validCuid = 'clh1b2c3d000008l1g2h3i4j5';
      const result = commitmentIdSchema.safeParse(validCuid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid or empty string', () => {
      expect(commitmentIdSchema.safeParse('').success).toBe(false);
      expect(commitmentIdSchema.safeParse('12345').success).toBe(false);
      expect(commitmentIdSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('referenceNumberSchema (Mandatory Correction 2)', () => {
    it('normalizes empty string to null', () => {
      const result = referenceNumberSchema.safeParse('');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('normalizes whitespace-only string to null', () => {
      const result = referenceNumberSchema.safeParse('    ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('trims and preserves valid reference number', () => {
      const result = referenceNumberSchema.safeParse('  PO-2026-001  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('PO-2026-001');
      }
    });

    it('accepts null and undefined', () => {
      expect(referenceNumberSchema.safeParse(null).success).toBe(true);
      expect(referenceNumberSchema.safeParse(undefined).success).toBe(true);
    });

    it('rejects reference numbers exceeding 100 characters', () => {
      const tooLong = 'A'.repeat(101);
      const result = referenceNumberSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });
  });

  describe('vendorNameSchema', () => {
    it('accepts valid vendor names', () => {
      expect(vendorNameSchema.safeParse('شركة الإنشاءات الحديثة').success).toBe(true);
      expect(vendorNameSchema.safeParse('AB').success).toBe(true);
    });

    it('trims whitespace', () => {
      const result = vendorNameSchema.safeParse('   شركة اليمامة   ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('شركة اليمامة');
      }
    });

    it('rejects strings shorter than 2 characters', () => {
      expect(vendorNameSchema.safeParse('A').success).toBe(false);
      expect(vendorNameSchema.safeParse('').success).toBe(false);
      expect(vendorNameSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects strings longer than 150 characters', () => {
      const tooLong = 'مورد '.repeat(40);
      expect(vendorNameSchema.safeParse(tooLong).success).toBe(false);
    });
  });

  describe('commitmentDateSchema', () => {
    it('accepts current and past dates', () => {
      expect(commitmentDateSchema.safeParse(new Date()).success).toBe(true);
      expect(commitmentDateSchema.safeParse('2026-01-01').success).toBe(true);
    });

    it('rejects dates in the distant future', () => {
      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 10);
      expect(commitmentDateSchema.safeParse(farFuture).success).toBe(false);
    });

    it('rejects invalid date formats', () => {
      expect(commitmentDateSchema.safeParse('not-a-date').success).toBe(false);
      expect(commitmentDateSchema.safeParse('').success).toBe(false);
    });
  });

  describe('createCommitmentDraftSchema', () => {
    const validCuid1 = 'clh1b2c3d000008l1g2h3i4j5';
    const validCuid2 = 'clh1b2c3d000008l1g2h3i4j6';

    it('accepts valid create payload', () => {
      const payload = {
        projectId: validCuid1,
        budgetLineId: validCuid2,
        vendorName: 'شركة التوريدات الإنشائية',
        referenceNumber: 'PO-2026-001',
        amount: '25000.50',
        commitmentDate: new Date().toISOString().split('T')[0],
        description: 'توريد حديد تسليح للموقع - الدفعة الأولى',
      };

      const result = createCommitmentDraftSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe('25000.50');
        expect(result.data.referenceNumber).toBe('PO-2026-001');
      }
    });

    it('rejects zero or negative amount', () => {
      const payloadZero = {
        projectId: validCuid1,
        budgetLineId: validCuid2,
        vendorName: 'شركة التوريدات الإنشائية',
        amount: '0.00',
        commitmentDate: new Date(),
        description: 'توريد حديد تسليح للموقع',
      };
      expect(createCommitmentDraftSchema.safeParse(payloadZero).success).toBe(false);

      const payloadNeg = {
        ...payloadZero,
        amount: '-1000.00',
      };
      expect(createCommitmentDraftSchema.safeParse(payloadNeg).success).toBe(false);
    });

    it('rejects description shorter than 3 characters', () => {
      const payload = {
        projectId: validCuid1,
        budgetLineId: validCuid2,
        vendorName: 'شركة التوريدات الإنشائية',
        amount: '500.00',
        commitmentDate: new Date(),
        description: 'أب',
      };
      expect(createCommitmentDraftSchema.safeParse(payload).success).toBe(false);
    });
  });

  describe('updateCommitmentDraftSchema', () => {
    const validCuid = 'clh1b2c3d000008l1g2h3i4j5';

    it('accepts valid update payload', () => {
      const payload = {
        budgetLineId: validCuid,
        vendorName: 'مورد الخرسانة الجاهزة',
        referenceNumber: '  ',
        amount: '12000.00',
        commitmentDate: new Date(),
        description: 'صب الخرسانة للأعمدة والميد',
      };

      const result = updateCommitmentDraftSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.referenceNumber).toBeNull(); // normalized!
      }
    });
  });

  describe('rejectCommitmentSchema', () => {
    it('accepts valid rejection reason', () => {
      const result = rejectCommitmentSchema.safeParse({
        rejectionReason: 'السعر أعلى من السقف المعتمد للبند',
      });
      expect(result.success).toBe(true);
    });

    it('rejects reason shorter than 3 characters or whitespace-only', () => {
      expect(rejectCommitmentSchema.safeParse({ rejectionReason: 'لا' }).success).toBe(false);
      expect(rejectCommitmentSchema.safeParse({ rejectionReason: '   ' }).success).toBe(false);
    });
  });
});
