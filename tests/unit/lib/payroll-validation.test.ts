/**
 * tests/unit/lib/payroll-validation.test.ts
 *
 * Unit tests for Payroll Zod validation schemas.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 *
 * Covers:
 * A. workerNameSchema (Arabic, English, min/max, whitespace normalization, empty/blank rejection)
 * B. workerReferenceSchema (valid, empty optional, too short, too long, invalid characters)
 * C. tradeOrTitleSchema (valid, optional, too short, too long)
 * D. periodYearSchema (2019 reject, 2020 accept, 2050 accept, 2051 reject, string coercion)
 * E. periodMonthSchema (0 reject, 1 accept, 12 accept, 13 reject, string coercion)
 * F. amount (0 reject, negative reject, 0.01 accept, 123.45 accept, >2 decimals reject, invalid format reject)
 * G. payrollDescriptionSchema (valid, blank, too short < 3, too long > 2000)
 * H. payrollCurrencySchema (SAR accept, non-SAR reject, default SAR)
 * I. payrollIdSchema (valid CUID, invalid formats)
 * J. createPayrollDraftSchema (valid payload, missing fields, lifecycle field stripping)
 * K. updatePayrollDraftSchema (valid mutable fields, lifecycle field stripping)
 * L. rejectPayrollSchema (required reason, min 5, max 1000, empty/missing rejected)
 * M. cancelPayrollSchema (required reason, min 5, max 1000, empty/missing rejected)
 * N. Security tests (lifecycle state injection prevention)
 */

import { describe, expect, it } from 'vitest';
import {
  payrollIdSchema,
  workerNameSchema,
  workerReferenceSchema,
  tradeOrTitleSchema,
  periodYearSchema,
  periodMonthSchema,
  payrollAmountSchema,
  payrollDescriptionSchema,
  payrollCurrencySchema,
  createPayrollDraftSchema,
  updatePayrollDraftSchema,
  rejectPayrollSchema,
  cancelPayrollSchema,
} from '@/lib/validation/schemas/payroll';

describe('Payroll Validation Schemas', () => {
  const validCuid1 = 'clh1b2c3d000008l1g2h3i4j5';
  const validCuid2 = 'clh1b2c3d000008l1g2h3i4j6';

  // -------------------------------------------------------------------------
  // A. workerNameSchema
  // -------------------------------------------------------------------------
  describe('workerNameSchema', () => {
    it('accepts valid Arabic name', () => {
      const res = workerNameSchema.safeParse('أحمد محمد علي');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('أحمد محمد علي');
      }
    });

    it('accepts valid English name', () => {
      const res = workerNameSchema.safeParse('John Doe');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('John Doe');
      }
    });

    it('normalizes leading and trailing whitespace', () => {
      const res = workerNameSchema.safeParse('   سالم عبدالله   ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('سالم عبدالله');
      }
    });

    it('collapses repeated internal whitespace into a single space', () => {
      const res = workerNameSchema.safeParse('أحمد     خالد    حسن');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('أحمد خالد حسن');
      }
    });

    it('rejects names shorter than 3 characters after trimming', () => {
      expect(workerNameSchema.safeParse('أب').success).toBe(false);
      expect(workerNameSchema.safeParse('  أب  ').success).toBe(false);
    });

    it('accepts workerName of exact length 100', () => {
      const name100 = 'أ' + 'ب'.repeat(99);
      const res = workerNameSchema.safeParse(name100);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.length).toBe(100);
      }
    });

    it('rejects workerName of length 101', () => {
      const name101 = 'أ' + 'ب'.repeat(100);
      expect(workerNameSchema.safeParse(name101).success).toBe(false);
    });

    it('rejects workerName of length 200', () => {
      const name200 = 'أ' + 'ب'.repeat(199);
      expect(workerNameSchema.safeParse(name200).success).toBe(false);
    });

    it('rejects empty or whitespace-only names', () => {
      expect(workerNameSchema.safeParse('').success).toBe(false);
      expect(workerNameSchema.safeParse('   ').success).toBe(false);
      expect(workerNameSchema.safeParse(null).success).toBe(false);
      expect(workerNameSchema.safeParse(undefined).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // B. workerReferenceSchema
  // -------------------------------------------------------------------------
  describe('workerReferenceSchema', () => {
    it('accepts valid alphanumeric reference with hyphens and underscores', () => {
      expect(workerReferenceSchema.safeParse('EMP-1002').success).toBe(true);
      expect(workerReferenceSchema.safeParse('WRK_501').success).toBe(true);
      expect(workerReferenceSchema.safeParse('12345').success).toBe(true);
    });

    it('treats empty string or whitespace as null (optional)', () => {
      const res1 = workerReferenceSchema.safeParse('');
      expect(res1.success).toBe(true);
      if (res1.success) expect(res1.data).toBeNull();

      const res2 = workerReferenceSchema.safeParse('   ');
      expect(res2.success).toBe(true);
      if (res2.success) expect(res2.data).toBeNull();

      const res3 = workerReferenceSchema.safeParse(null);
      expect(res3.success).toBe(true);
      if (res3.success) expect(res3.data).toBeNull();

      const res4 = workerReferenceSchema.safeParse(undefined);
      expect(res4.success).toBe(true);
      if (res4.success) expect(res4.data).toBeUndefined();
    });

    it('accepts workerReference of exact length 50', () => {
      const ref50 = 'W' + '0'.repeat(49);
      const res = workerReferenceSchema.safeParse(ref50);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data?.length).toBe(50);
      }
    });

    it('rejects workerReference of length 51', () => {
      const ref51 = 'W' + '0'.repeat(50);
      expect(workerReferenceSchema.safeParse(ref51).success).toBe(false);
    });

    it('rejects supplied workerReference shorter than 3 characters', () => {
      expect(workerReferenceSchema.safeParse('W').success).toBe(false);
      expect(workerReferenceSchema.safeParse('12').success).toBe(false);
    });

    it('rejects references containing invalid characters (spaces, special characters)', () => {
      expect(workerReferenceSchema.safeParse('EMP 1002').success).toBe(false);
      expect(workerReferenceSchema.safeParse('EMP@1002').success).toBe(false);
      expect(workerReferenceSchema.safeParse('EMP#1002').success).toBe(false);
      expect(workerReferenceSchema.safeParse('WRK$99').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // C. tradeOrTitleSchema
  // -------------------------------------------------------------------------
  describe('tradeOrTitleSchema', () => {
    it('accepts valid trade or title', () => {
      expect(tradeOrTitleSchema.safeParse('نجار مسلح').success).toBe(true);
      expect(tradeOrTitleSchema.safeParse('Foreman').success).toBe(true);
      expect(tradeOrTitleSchema.safeParse('عامل بناء').success).toBe(true);
    });

    it('normalizes internal and outer whitespace', () => {
      const res = tradeOrTitleSchema.safeParse('   حداد    مسلح   ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('حداد مسلح');
      }
    });

    it('treats empty string, whitespace, null, or undefined as null/undefined (optional)', () => {
      expect(tradeOrTitleSchema.safeParse('').data).toBeNull();
      expect(tradeOrTitleSchema.safeParse('   ').data).toBeNull();
      expect(tradeOrTitleSchema.safeParse(null).data).toBeNull();
      expect(tradeOrTitleSchema.safeParse(undefined).data).toBeUndefined();
    });

    it('accepts tradeOrTitle of exact length 50', () => {
      const title50 = 'ف' + 'ن'.repeat(49);
      const res = tradeOrTitleSchema.safeParse(title50);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data?.length).toBe(50);
      }
    });

    it('rejects tradeOrTitle of length 51', () => {
      const title51 = 'ف' + 'ن'.repeat(50);
      expect(tradeOrTitleSchema.safeParse(title51).success).toBe(false);
    });

    it('rejects tradeOrTitle of length 100', () => {
      const title100 = 'ف' + 'ن'.repeat(99);
      expect(tradeOrTitleSchema.safeParse(title100).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // D. periodYearSchema
  // -------------------------------------------------------------------------
  describe('periodYearSchema', () => {
    it('accepts 2020 boundary', () => {
      expect(periodYearSchema.safeParse(2020).success).toBe(true);
    });

    it('accepts 2050 boundary', () => {
      expect(periodYearSchema.safeParse(2050).success).toBe(true);
    });

    it('accepts mid-range year (2026)', () => {
      expect(periodYearSchema.safeParse(2026).success).toBe(true);
    });

    it('coerces valid string input to number', () => {
      const res = periodYearSchema.safeParse('2026');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe(2026);
      }
    });

    it('rejects year 2019 (below minimum 2020)', () => {
      expect(periodYearSchema.safeParse(2019).success).toBe(false);
      expect(periodYearSchema.safeParse('2019').success).toBe(false);
    });

    it('rejects year 2051 (above maximum 2050)', () => {
      expect(periodYearSchema.safeParse(2051).success).toBe(false);
      expect(periodYearSchema.safeParse('2051').success).toBe(false);
    });

    it('rejects non-integer year', () => {
      expect(periodYearSchema.safeParse(2026.5).success).toBe(false);
    });

    it('rejects non-numeric string', () => {
      expect(periodYearSchema.safeParse('abc').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // E. periodMonthSchema
  // -------------------------------------------------------------------------
  describe('periodMonthSchema', () => {
    it('accepts month 1 boundary', () => {
      expect(periodMonthSchema.safeParse(1).success).toBe(true);
    });

    it('accepts month 12 boundary', () => {
      expect(periodMonthSchema.safeParse(12).success).toBe(true);
    });

    it('coerces valid string input to number', () => {
      const res = periodMonthSchema.safeParse('9');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe(9);
      }
    });

    it('rejects month 0 (below minimum 1)', () => {
      expect(periodMonthSchema.safeParse(0).success).toBe(false);
      expect(periodMonthSchema.safeParse('0').success).toBe(false);
    });

    it('rejects month 13 (above maximum 12)', () => {
      expect(periodMonthSchema.safeParse(13).success).toBe(false);
      expect(periodMonthSchema.safeParse('13').success).toBe(false);
    });

    it('rejects non-integer month', () => {
      expect(periodMonthSchema.safeParse(6.5).success).toBe(false);
    });

    it('rejects non-numeric string', () => {
      expect(periodMonthSchema.safeParse('jan').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // F. amount (payrollAmountSchema)
  // -------------------------------------------------------------------------
  describe('payrollAmountSchema', () => {
    it('accepts valid monetary amounts (0.01, 123.45, 1500, 250000.00)', () => {
      expect(payrollAmountSchema.safeParse('0.01').success).toBe(true);
      expect(payrollAmountSchema.safeParse('123.45').success).toBe(true);
      expect(payrollAmountSchema.safeParse('1500').success).toBe(true);
      expect(payrollAmountSchema.safeParse('250000.00').success).toBe(true);
    });

    it('accepts number and coerces to string', () => {
      const res = payrollAmountSchema.safeParse(2500.5);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('2500.5');
      }
    });

    it('trims whitespace around amount', () => {
      const res = payrollAmountSchema.safeParse('  3500.00  ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('3500.00');
      }
    });

    it('rejects zero amounts (0, 0.0, 0.00)', () => {
      expect(payrollAmountSchema.safeParse('0').success).toBe(false);
      expect(payrollAmountSchema.safeParse('0.0').success).toBe(false);
      expect(payrollAmountSchema.safeParse('0.00').success).toBe(false);
    });

    it('rejects negative amounts (-500.00, -1)', () => {
      expect(payrollAmountSchema.safeParse('-500.00').success).toBe(false);
      expect(payrollAmountSchema.safeParse('-1').success).toBe(false);
    });

    it('rejects amounts with more than 2 decimal places (100.555)', () => {
      expect(payrollAmountSchema.safeParse('100.555').success).toBe(false);
      expect(payrollAmountSchema.safeParse('100.1234').success).toBe(false);
    });

    it('rejects malformed numbers and non-numeric strings', () => {
      expect(payrollAmountSchema.safeParse('abc').success).toBe(false);
      expect(payrollAmountSchema.safeParse('10..00').success).toBe(false);
      expect(payrollAmountSchema.safeParse('1,500.00').success).toBe(false);
      expect(payrollAmountSchema.safeParse('').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // G. payrollDescriptionSchema
  // -------------------------------------------------------------------------
  describe('payrollDescriptionSchema', () => {
    it('accepts valid description', () => {
      const desc = 'صرف رواتب وأجور عمالة موقع مشروع المبنى الإداري';
      const res = payrollDescriptionSchema.safeParse(desc);
      expect(res.success).toBe(true);
    });

    it('rejects description shorter than 3 characters', () => {
      expect(payrollDescriptionSchema.safeParse('أب').success).toBe(false);
      expect(payrollDescriptionSchema.safeParse('  أب  ').success).toBe(false);
    });

    it('rejects empty or whitespace-only description', () => {
      expect(payrollDescriptionSchema.safeParse('').success).toBe(false);
      expect(payrollDescriptionSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects description exceeding 2000 characters', () => {
      const longDesc = 'وصف عمل '.repeat(300); // > 2000 chars
      expect(payrollDescriptionSchema.safeParse(longDesc).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // H. payrollCurrencySchema
  // -------------------------------------------------------------------------
  describe('payrollCurrencySchema', () => {
    it('accepts SAR', () => {
      expect(payrollCurrencySchema.safeParse('SAR').success).toBe(true);
    });

    it('defaults to SAR when omitted / undefined', () => {
      const res = payrollCurrencySchema.safeParse(undefined);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('SAR');
      }
    });

    it('rejects non-SAR currencies (USD, EUR, AED, sar)', () => {
      expect(payrollCurrencySchema.safeParse('USD').success).toBe(false);
      expect(payrollCurrencySchema.safeParse('EUR').success).toBe(false);
      expect(payrollCurrencySchema.safeParse('AED').success).toBe(false);
      expect(payrollCurrencySchema.safeParse('sar').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // I. payrollIdSchema
  // -------------------------------------------------------------------------
  describe('payrollIdSchema', () => {
    it('accepts valid CUID', () => {
      expect(payrollIdSchema.safeParse(validCuid1).success).toBe(true);
    });

    it('rejects non-CUID and empty string', () => {
      expect(payrollIdSchema.safeParse('123').success).toBe(false);
      expect(payrollIdSchema.safeParse('').success).toBe(false);
      expect(payrollIdSchema.safeParse('not-a-cuid').success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // J. createPayrollDraftSchema
  // -------------------------------------------------------------------------
  describe('createPayrollDraftSchema', () => {
    const validCreatePayload = {
      projectId: validCuid1,
      budgetLineId: validCuid2,
      workerName: 'محمود أحمد حسن',
      workerReference: 'WRK-2026-01',
      tradeOrTitle: 'فني كهرباء',
      periodYear: 2026,
      periodMonth: 9,
      amount: '4500.00',
      currency: 'SAR',
      description: 'أجور أعمال التمديدات الكهربائية في الموقع لشهر سبتمبر',
    };

    it('accepts valid complete create payload', () => {
      const res = createPayrollDraftSchema.safeParse(validCreatePayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.workerName).toBe('محمود أحمد حسن');
        expect(res.data.periodYear).toBe(2026);
        expect(res.data.periodMonth).toBe(9);
        expect(res.data.amount).toBe('4500.00');
        expect(res.data.currency).toBe('SAR');
      }
    });

    it('accepts payload without optional workerReference and tradeOrTitle', () => {
      const { workerReference: _r, tradeOrTitle: _t, ...minimalPayload } = validCreatePayload;
      const res = createPayrollDraftSchema.safeParse(minimalPayload);
      expect(res.success).toBe(true);
    });

    it('rejects when required fields are missing', () => {
      const { projectId: _p, ...missingProject } = validCreatePayload;
      expect(createPayrollDraftSchema.safeParse(missingProject).success).toBe(false);

      const { budgetLineId: _b, ...missingBudgetLine } = validCreatePayload;
      expect(createPayrollDraftSchema.safeParse(missingBudgetLine).success).toBe(false);

      const { workerName: _w, ...missingWorkerName } = validCreatePayload;
      expect(createPayrollDraftSchema.safeParse(missingWorkerName).success).toBe(false);

      const { amount: _a, ...missingAmount } = validCreatePayload;
      expect(createPayrollDraftSchema.safeParse(missingAmount).success).toBe(false);

      const { description: _d, ...missingDesc } = validCreatePayload;
      expect(createPayrollDraftSchema.safeParse(missingDesc).success).toBe(false);
    });

    it('SECURITY: strips forbidden lifecycle fields from parsed output', () => {
      const maliciousPayload = {
        ...validCreatePayload,
        status: 'APPROVED',
        approvedById: validCuid1,
        approvedAt: new Date(),
        rejectedById: validCuid1,
        rejectedAt: new Date(),
        submittedById: validCuid1,
        submittedAt: new Date(),
        createdById: validCuid1,
        cancelledById: validCuid1,
        cancelledAt: new Date(),
        deletedAt: new Date(),
      };

      const res = createPayrollDraftSchema.safeParse(maliciousPayload);
      expect(res.success).toBe(true);
      if (res.success) {
        const parsed = res.data as Record<string, unknown>;
        expect('status' in parsed).toBe(false);
        expect('approvedById' in parsed).toBe(false);
        expect('approvedAt' in parsed).toBe(false);
        expect('rejectedById' in parsed).toBe(false);
        expect('rejectedAt' in parsed).toBe(false);
        expect('submittedById' in parsed).toBe(false);
        expect('submittedAt' in parsed).toBe(false);
        expect('createdById' in parsed).toBe(false);
        expect('cancelledById' in parsed).toBe(false);
        expect('cancelledAt' in parsed).toBe(false);
        expect('deletedAt' in parsed).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // K. updatePayrollDraftSchema
  // -------------------------------------------------------------------------
  describe('updatePayrollDraftSchema', () => {
    const validUpdatePayload = {
      workerName: 'محمود أحمد حسن - محدث',
      workerReference: 'WRK-2026-02',
      tradeOrTitle: 'مشرف كهرباء',
      periodYear: 2026,
      periodMonth: 10,
      amount: '5000.00',
      description: 'تحديث بيانات القيد والأجر للشهر التالي',
    };

    it('accepts valid update payload', () => {
      const res = updatePayrollDraftSchema.safeParse(validUpdatePayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.workerName).toBe('محمود أحمد حسن - محدث');
        expect(res.data.amount).toBe('5000.00');
        expect(res.data.periodMonth).toBe(10);
      }
    });

    it('accepts update payload with optional projectId and budgetLineId', () => {
      const payloadWithProjects = {
        ...validUpdatePayload,
        projectId: validCuid1,
        budgetLineId: validCuid2,
      };
      const res = updatePayrollDraftSchema.safeParse(payloadWithProjects);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.projectId).toBe(validCuid1);
        expect(res.data.budgetLineId).toBe(validCuid2);
      }
    });

    it('SECURITY: strips forbidden server-owned lifecycle fields', () => {
      const payloadWithLifecycle = {
        ...validUpdatePayload,
        status: 'APPROVED',
        approvedById: validCuid1,
        createdById: validCuid1,
        deletedAt: new Date(),
      };

      const res = updatePayrollDraftSchema.safeParse(payloadWithLifecycle);
      expect(res.success).toBe(true);
      if (res.success) {
        const parsed = res.data as Record<string, unknown>;
        expect('status' in parsed).toBe(false);
        expect('approvedById' in parsed).toBe(false);
        expect('createdById' in parsed).toBe(false);
        expect('deletedAt' in parsed).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // L. rejectPayrollSchema
  // -------------------------------------------------------------------------
  describe('rejectPayrollSchema', () => {
    it('accepts valid rejection reason (>= 5 chars)', () => {
      const res = rejectPayrollSchema.safeParse({
        rejectionReason: 'بيانات ساعات العمل غير مطابقة لسجل الموقع الفعلي',
      });
      expect(res.success).toBe(true);
    });

    it('rejects reason shorter than 5 characters', () => {
      expect(rejectPayrollSchema.safeParse({ rejectionReason: 'خطأ' }).success).toBe(false);
      expect(rejectPayrollSchema.safeParse({ rejectionReason: 'لا' }).success).toBe(false);
    });

    it('rejects empty or whitespace-only reason', () => {
      expect(rejectPayrollSchema.safeParse({ rejectionReason: '' }).success).toBe(false);
      expect(rejectPayrollSchema.safeParse({ rejectionReason: '    ' }).success).toBe(false);
      expect(rejectPayrollSchema.safeParse({}).success).toBe(false);
    });

    it('rejects reason exceeding 1000 characters', () => {
      const longReason = 'سبب رفض طويل '.repeat(100); // > 1000 chars
      expect(rejectPayrollSchema.safeParse({ rejectionReason: longReason }).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // M. cancelPayrollSchema
  // -------------------------------------------------------------------------
  describe('cancelPayrollSchema', () => {
    it('accepts valid cancellation reason (>= 5 chars)', () => {
      const res = cancelPayrollSchema.safeParse({
        cancellationReason: 'تم تسجيل القيد بالخطأ وسيتم إعادة إدخاله في المشروع الصحيح',
      });
      expect(res.success).toBe(true);
    });

    it('rejects reason shorter than 5 characters', () => {
      expect(cancelPayrollSchema.safeParse({ cancellationReason: 'إلغاء' }).success).toBe(true); // 'إلغاء' is 5 chars
      expect(cancelPayrollSchema.safeParse({ cancellationReason: 'تم' }).success).toBe(false); // 2 chars
      expect(cancelPayrollSchema.safeParse({ cancellationReason: 'خطأ' }).success).toBe(false); // 3 chars
    });

    it('rejects empty or whitespace-only reason', () => {
      expect(cancelPayrollSchema.safeParse({ cancellationReason: '' }).success).toBe(false);
      expect(cancelPayrollSchema.safeParse({ cancellationReason: '   ' }).success).toBe(false);
      expect(cancelPayrollSchema.safeParse({}).success).toBe(false);
    });

    it('rejects reason exceeding 1000 characters', () => {
      const longReason = 'سبب إلغاء '.repeat(110); // > 1000 chars
      expect(cancelPayrollSchema.safeParse({ cancellationReason: longReason }).success).toBe(false);
    });
  });
});
