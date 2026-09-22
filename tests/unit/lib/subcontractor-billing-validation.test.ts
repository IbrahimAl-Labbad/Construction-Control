/**
 * tests/unit/lib/subcontractor-billing-validation.test.ts
 *
 * Unit tests for Subcontractor Billing Zod validation schemas.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 *
 * Covers:
 * - billingIdSchema (valid cuid, invalid rejected)
 * - subcontractorNameSchema (valid, trimmed, 2-150 chars)
 * - referenceNumberSchema (alias to billingReferenceNumberSchema: normal value, empty/whitespace -> null, <= 100)
 * - billingPeriodSchema (valid, trimmed, non-blank, <= 100, no uniqueness constraint)
 * - claimDateSchema (valid date, invalid date, future date rejected, 1-day tolerance)
 * - createBillingDraftSchema (complete valid payload, missing fields, invalid/zero/negative grossAmount)
 * - updateBillingDraftSchema (valid, verifies projectId & commitmentId are stripped/immutable)
 * - rejectBillingSchema (valid reason, too short < 3, too long > 500)
 * - cancelBillingSchema (valid reason, too short < 5, too long > 500, optional when omitted)
 */

import { describe, expect, it } from 'vitest';
import {
  billingIdSchema,
  billingReferenceNumberSchema,
  referenceNumberSchema,
  subcontractorNameSchema,
  billingPeriodSchema,
  claimDateSchema,
  createBillingDraftSchema,
  updateBillingDraftSchema,
  rejectBillingSchema,
  cancelBillingSchema,
} from '@/lib/validation/schemas/subcontractor-billing';

describe('Subcontractor Billing Validation Schemas', () => {
  const validCuid1 = 'clh1b2c3d000008l1g2h3i4j5';
  const validCuid2 = 'clh1b2c3d000008l1g2h3i4j6';
  const validCuid3 = 'clh1b2c3d000008l1g2h3i4j7';

  // -------------------------------------------------------------------------
  // 1. billingIdSchema
  // -------------------------------------------------------------------------
  describe('billingIdSchema', () => {
    it('accepts valid CUID', () => {
      const result = billingIdSchema.safeParse(validCuid1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validCuid1);
      }
    });

    it('rejects empty string, non-cuid format, null, and undefined', () => {
      expect(billingIdSchema.safeParse('').success).toBe(false);
      expect(billingIdSchema.safeParse('not-a-cuid').success).toBe(false);
      expect(billingIdSchema.safeParse('12345').success).toBe(false);
      expect(billingIdSchema.safeParse(null).success).toBe(false);
      expect(billingIdSchema.safeParse(undefined).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. subcontractorNameSchema
  // -------------------------------------------------------------------------
  describe('subcontractorNameSchema', () => {
    it('accepts valid subcontractor names', () => {
      expect(subcontractorNameSchema.safeParse('شركة الأساسات المتطورة').success).toBe(true);
      expect(subcontractorNameSchema.safeParse('AB').success).toBe(true);
    });

    it('trims leading and trailing whitespace', () => {
      const result = subcontractorNameSchema.safeParse('   مؤسسة الإعمار   ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('مؤسسة الإعمار');
      }
    });

    it('rejects strings shorter than 2 characters or whitespace-only', () => {
      expect(subcontractorNameSchema.safeParse('A').success).toBe(false);
      expect(subcontractorNameSchema.safeParse('').success).toBe(false);
      expect(subcontractorNameSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects subcontractor names exceeding 150 characters', () => {
      const exactly150 = 'مقاول '.repeat(25); // 25 * 6 = 150 chars
      expect(subcontractorNameSchema.safeParse(exactly150).success).toBe(true);

      const over150 = 'A'.repeat(151);
      expect(subcontractorNameSchema.safeParse(over150).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. referenceNumberSchema
  // -------------------------------------------------------------------------
  describe('referenceNumberSchema', () => {
    it('accepts and trims normal reference number', () => {
      const result = referenceNumberSchema.safeParse('  BILL-2026-001  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('BILL-2026-001');
      }
    });

    it('normalizes empty string to null', () => {
      const result = referenceNumberSchema.safeParse('');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('normalizes whitespace-only string to null', () => {
      const result = referenceNumberSchema.safeParse('     ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('accepts null and undefined', () => {
      expect(referenceNumberSchema.safeParse(null).success).toBe(true);
      expect(referenceNumberSchema.safeParse(undefined).success).toBe(true);
    });

    it('rejects reference numbers exceeding 100 characters', () => {
      const exactly100 = 'R'.repeat(100);
      expect(referenceNumberSchema.safeParse(exactly100).success).toBe(true);

      const over100 = 'R'.repeat(101);
      expect(referenceNumberSchema.safeParse(over100).success).toBe(false);
    });

    it('billingReferenceNumberSchema behaves identically to referenceNumberSchema', () => {
      expect(billingReferenceNumberSchema).toBe(referenceNumberSchema);
    });
  });

  // -------------------------------------------------------------------------
  // 4. billingPeriodSchema
  // -------------------------------------------------------------------------
  describe('billingPeriodSchema', () => {
    it('accepts valid billing periods', () => {
      expect(billingPeriodSchema.safeParse('سبتمبر 2026').success).toBe(true);
      expect(billingPeriodSchema.safeParse('الشهر الأول - أعمال الحفر').success).toBe(true);
      expect(billingPeriodSchema.safeParse('Period 01').success).toBe(true);
    });

    it('trims leading and trailing whitespace', () => {
      const result = billingPeriodSchema.safeParse('   أكتوبر 2026   ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('أكتوبر 2026');
      }
    });

    it('rejects blank, whitespace-only, or under 2 characters', () => {
      expect(billingPeriodSchema.safeParse('').success).toBe(false);
      expect(billingPeriodSchema.safeParse('   ').success).toBe(false);
      expect(billingPeriodSchema.safeParse('A').success).toBe(false);
    });

    it('rejects billing periods exceeding 100 characters', () => {
      const exactly100 = 'فترة '.repeat(20); // 20 * 5 = 100 chars
      expect(billingPeriodSchema.safeParse(exactly100).success).toBe(true);

      const over100 = 'B'.repeat(101);
      expect(billingPeriodSchema.safeParse(over100).success).toBe(false);
    });

    it('enforces NO uniqueness behavior (decision #23 — free text parsed independently)', () => {
      const period = 'سبتمبر 2026';
      const parse1 = billingPeriodSchema.safeParse(period);
      const parse2 = billingPeriodSchema.safeParse(period);
      expect(parse1.success).toBe(true);
      expect(parse2.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. claimDateSchema
  // -------------------------------------------------------------------------
  describe('claimDateSchema', () => {
    it('accepts current and past dates', () => {
      expect(claimDateSchema.safeParse(new Date()).success).toBe(true);
      expect(claimDateSchema.safeParse('2026-01-15').success).toBe(true);
      expect(claimDateSchema.safeParse('2025-06-01T00:00:00.000Z').success).toBe(true);
    });

    it('rejects invalid date values', () => {
      expect(claimDateSchema.safeParse('not-a-date').success).toBe(false);
      expect(claimDateSchema.safeParse('').success).toBe(false);
      expect(claimDateSchema.safeParse('   ').success).toBe(false);
      expect(claimDateSchema.safeParse(null).success).toBe(false);
      expect(claimDateSchema.safeParse(undefined).success).toBe(false);
    });

    it('verifies future date rejection and 1-day timezone tolerance behavior', () => {
      // 1-day in the future is tolerated for timezone discrepancies (same as commitmentDateSchema)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(claimDateSchema.safeParse(tomorrow).success).toBe(true);

      // Beyond 1 day in the future must be rejected
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      expect(claimDateSchema.safeParse(futureDate).success).toBe(false);

      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      expect(claimDateSchema.safeParse(farFuture).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. createBillingDraftSchema
  // -------------------------------------------------------------------------
  describe('createBillingDraftSchema', () => {
    const validPayload = {
      projectId: validCuid1,
      budgetLineId: validCuid2,
      commitmentId: validCuid3,
      subcontractorName: 'شركة المقاولات الإنشائية',
      referenceNumber: 'BILL-2026-001',
      billingPeriod: 'سبتمبر 2026',
      claimDate: '2026-09-15',
      grossAmount: '25000.50',
      description: 'تنفيذ أعمال الخرسانة المسلحة للدور الأرضي',
    };

    it('accepts a complete valid payload', () => {
      const result = createBillingDraftSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe(validCuid1);
        expect(result.data.commitmentId).toBe(validCuid3);
        expect(result.data.grossAmount).toBe('25000.50');
        expect(result.data.referenceNumber).toBe('BILL-2026-001');
      }
    });

    it('rejects when projectId is missing or not a valid CUID', () => {
      const { projectId: _ignored, ...missingProject } = validPayload;
      expect(createBillingDraftSchema.safeParse(missingProject).success).toBe(false);

      const invalidProject = { ...validPayload, projectId: 'invalid-id' };
      expect(createBillingDraftSchema.safeParse(invalidProject).success).toBe(false);
    });

    it('rejects when budgetLineId is missing or not a valid CUID', () => {
      const { budgetLineId: _ignored, ...missingBudgetLine } = validPayload;
      expect(createBillingDraftSchema.safeParse(missingBudgetLine).success).toBe(false);

      const invalidBudgetLine = { ...validPayload, budgetLineId: 'not-cuid' };
      expect(createBillingDraftSchema.safeParse(invalidBudgetLine).success).toBe(false);
    });

    it('rejects when commitmentId is missing or not a valid CUID', () => {
      const { commitmentId: _ignored, ...missingCommitment } = validPayload;
      expect(createBillingDraftSchema.safeParse(missingCommitment).success).toBe(false);

      const invalidCommitment = { ...validPayload, commitmentId: '123' };
      expect(createBillingDraftSchema.safeParse(invalidCommitment).success).toBe(false);
    });

    it('rejects invalid grossAmount format', () => {
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, grossAmount: 'abc' }).success,
      ).toBe(false);
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, grossAmount: '12.345' }).success,
      ).toBe(false);
    });

    it('rejects zero grossAmount (0.00)', () => {
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, grossAmount: '0.00' }).success,
      ).toBe(false);
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, grossAmount: '0' }).success,
      ).toBe(false);
    });

    it('rejects negative grossAmount', () => {
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, grossAmount: '-1000.00' }).success,
      ).toBe(false);
    });

    it('rejects description shorter than 3 characters', () => {
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, description: 'أب' }).success,
      ).toBe(false);
      expect(
        createBillingDraftSchema.safeParse({ ...validPayload, description: '   ' }).success,
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. updateBillingDraftSchema
  // -------------------------------------------------------------------------
  describe('updateBillingDraftSchema', () => {
    const validUpdatePayload = {
      subcontractorName: 'شركة المقاولات المحدثة',
      referenceNumber: 'BILL-REV-002',
      billingPeriod: 'سبتمبر 2026 - محدث',
      claimDate: '2026-09-20',
      grossAmount: '30000.00',
      description: 'تعديل وتحديث مستخلص الأعمال المنفذة',
    };

    it('accepts valid update payload', () => {
      const result = updateBillingDraftSchema.safeParse(validUpdatePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subcontractorName).toBe('شركة المقاولات المحدثة');
        expect(result.data.grossAmount).toBe('30000.00');
      }
    });

    it('verifies projectId and commitmentId are not accepted as mutable fields (stripped from output)', () => {
      const payloadWithImmutables = {
        ...validUpdatePayload,
        projectId: validCuid1,
        commitmentId: validCuid2,
        budgetLineId: validCuid3,
      };

      const result = updateBillingDraftSchema.safeParse(payloadWithImmutables);
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = result.data as Record<string, unknown>;
        expect('projectId' in parsed).toBe(false);
        expect('commitmentId' in parsed).toBe(false);
        expect('budgetLineId' in parsed).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. rejectBillingSchema
  // -------------------------------------------------------------------------
  describe('rejectBillingSchema', () => {
    it('accepts valid rejection reason', () => {
      const result = rejectBillingSchema.safeParse({
        rejectionReason: 'الكميات المنفذة في الموقع غير مطابقة لشهادة الاستلام',
      });
      expect(result.success).toBe(true);
    });

    it('rejects reason shorter than 3 characters or whitespace-only', () => {
      expect(rejectBillingSchema.safeParse({ rejectionReason: 'لا' }).success).toBe(false);
      expect(rejectBillingSchema.safeParse({ rejectionReason: '' }).success).toBe(false);
      expect(rejectBillingSchema.safeParse({ rejectionReason: '   ' }).success).toBe(false);
    });

    it('rejects reason exceeding 500 characters', () => {
      const over500 = 'سبب '.repeat(126); // 126 * 4 = 504 chars
      expect(rejectBillingSchema.safeParse({ rejectionReason: over500 }).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 9. cancelBillingSchema
  // -------------------------------------------------------------------------
  describe('cancelBillingSchema', () => {
    it('accepts valid cancellation reason', () => {
      const result = cancelBillingSchema.safeParse({
        cancellationReason: 'تم إنهاء العقد بالاتفاق مع مقاول الباطن',
      });
      expect(result.success).toBe(true);
    });

    it('rejects reason shorter than 5 characters when provided', () => {
      expect(cancelBillingSchema.safeParse({ cancellationReason: 'تم' }).success).toBe(false);
      expect(cancelBillingSchema.safeParse({ cancellationReason: 'إلغ' }).success).toBe(false);
    });

    it('rejects reason exceeding 500 characters', () => {
      const over500 = 'إلغاء '.repeat(85); // 85 * 6 = 510 chars
      expect(cancelBillingSchema.safeParse({ cancellationReason: over500 }).success).toBe(false);
    });

    it('supports optional cancellation reason as implemented', () => {
      const emptyObjResult = cancelBillingSchema.safeParse({});
      expect(emptyObjResult.success).toBe(true);
      if (emptyObjResult.success) {
        expect(emptyObjResult.data.cancellationReason).toBeUndefined();
      }

      const undefinedResult = cancelBillingSchema.safeParse({ cancellationReason: undefined });
      expect(undefinedResult.success).toBe(true);
    });
  });
});
