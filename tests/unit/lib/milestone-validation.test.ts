import { describe, expect, it } from 'vitest';
import {
  createMilestoneSchema,
  updateMilestoneMetadataSchema,
  cancelMilestoneSchema,
  reorderMilestonesSchema,
  milestoneTitleSchema,
  milestoneDescriptionSchema,
  milestoneTargetDateSchema,
  milestoneCancellationReasonSchema,
  reportMilestoneIdsSchema,
  linkProgressReportSchema,
  unlinkProgressReportSchema,
} from '@/lib/validation/schemas/milestone';

describe('Milestone Validation Schemas (Unit Tests)', () => {
  const validProjectId = 'cjld2cjxh0000qzrmn831i7rn';
  const validMilestoneId = 'cjld2cjxh0001qzrmn831i7rn';
  const validMilestoneId2 = 'cjld2cjxh0002qzrmn831i7rn';
  const validReportId = 'cjld2cjxh0003qzrmn831i7rn';

  describe('milestoneTitleSchema', () => {
    it('accepts valid titles between 2 and 150 chars', () => {
      expect(milestoneTitleSchema.parse('صب القواعد')).toBe('صب القواعد');
    });

    it('rejects title shorter than 2 chars', () => {
      expect(() => milestoneTitleSchema.parse('أ')).toThrow();
      expect(() => milestoneTitleSchema.parse('')).toThrow();
      expect(() => milestoneTitleSchema.parse('   ')).toThrow();
    });

    it('rejects title longer than 150 chars', () => {
      const longTitle = 'أ'.repeat(151);
      expect(() => milestoneTitleSchema.parse(longTitle)).toThrow();
    });
  });

  describe('milestoneDescriptionSchema', () => {
    it('converts empty string to null', () => {
      expect(milestoneDescriptionSchema.parse('')).toBeNull();
      expect(milestoneDescriptionSchema.parse('   ')).toBeNull();
      expect(milestoneDescriptionSchema.parse(null)).toBeNull();
      expect(milestoneDescriptionSchema.parse(undefined)).toBeNull();
    });

    it('preserves valid description', () => {
      expect(milestoneDescriptionSchema.parse('وصف المحطة')).toBe('وصف المحطة');
    });

    it('rejects description longer than 1000 chars', () => {
      const longDesc = 'و'.repeat(1001);
      expect(() => milestoneDescriptionSchema.parse(longDesc)).toThrow();
    });
  });

  describe('milestoneTargetDateSchema', () => {
    it('parses valid YYYY-MM-DD string as Date object', () => {
      const date = milestoneTargetDateSchema.parse('2026-10-15');
      expect(date).toBeInstanceOf(Date);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(9); // 0-indexed: 9 is October
      expect(date.getUTCDate()).toBe(15);
    });

    it('rejects invalid date string', () => {
      expect(() => milestoneTargetDateSchema.parse('not-a-date')).toThrow();
    });
  });

  describe('milestoneCancellationReasonSchema', () => {
    it('accepts valid non-empty reason', () => {
      expect(milestoneCancellationReasonSchema.parse('إلغاء تعاقدي')).toBe('إلغاء تعاقدي');
    });

    it('rejects empty reason', () => {
      expect(() => milestoneCancellationReasonSchema.parse('')).toThrow();
      expect(() => milestoneCancellationReasonSchema.parse('   ')).toThrow();
    });

    it('rejects reason longer than 500 chars', () => {
      expect(() => milestoneCancellationReasonSchema.parse('س'.repeat(501))).toThrow();
    });
  });

  describe('createMilestoneSchema', () => {
    it('accepts valid input', () => {
      const res = createMilestoneSchema.safeParse({
        projectId: validProjectId,
        title: 'انتهاء أعمال الحفر',
        description: 'تسوية الأرض وجاهزية الأساسات',
        targetDate: '2026-11-01',
      });
      expect(res.success).toBe(true);
    });

    it('rejects missing title or projectId', () => {
      expect(
        createMilestoneSchema.safeParse({
          projectId: validProjectId,
          targetDate: '2026-11-01',
        }).success,
      ).toBe(false);

      expect(
        createMilestoneSchema.safeParse({
          title: 'عنوان',
          targetDate: '2026-11-01',
        }).success,
      ).toBe(false);
    });
  });

  describe('updateMilestoneMetadataSchema', () => {
    it('accepts partial updates', () => {
      expect(
        updateMilestoneMetadataSchema.safeParse({
          title: 'عنوان جديد',
        }).success,
      ).toBe(true);

      expect(
        updateMilestoneMetadataSchema.safeParse({
          targetDate: '2026-12-01',
        }).success,
      ).toBe(true);
    });

    it('rejects empty object', () => {
      expect(updateMilestoneMetadataSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('cancelMilestoneSchema', () => {
    it('requires cancellationReason', () => {
      expect(
        cancelMilestoneSchema.safeParse({
          cancellationReason: 'تغيير المخطط الهندسي',
        }).success,
      ).toBe(true);

      expect(
        cancelMilestoneSchema.safeParse({
          cancellationReason: '',
        }).success,
      ).toBe(false);
    });
  });

  describe('reorderMilestonesSchema', () => {
    it('accepts array of unique milestone IDs', () => {
      const res = reorderMilestonesSchema.safeParse({
        projectId: validProjectId,
        milestoneIds: [validMilestoneId, validMilestoneId2],
      });
      expect(res.success).toBe(true);
    });

    it('rejects duplicate milestone IDs', () => {
      const res = reorderMilestonesSchema.safeParse({
        projectId: validProjectId,
        milestoneIds: [validMilestoneId, validMilestoneId],
      });
      expect(res.success).toBe(false);
    });

    it('rejects empty milestoneIds array', () => {
      const res = reorderMilestonesSchema.safeParse({
        projectId: validProjectId,
        milestoneIds: [],
      });
      expect(res.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // CR-08 / BD-17 Linkage Schemas
  // ---------------------------------------------------------------------------

  describe('reportMilestoneIdsSchema', () => {
    it('accepts an empty array of milestone IDs', () => {
      const result = reportMilestoneIdsSchema.safeParse([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('accepts an array of distinct valid CUID milestone IDs', () => {
      const result = reportMilestoneIdsSchema.safeParse([
        validMilestoneId,
        validMilestoneId2,
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([validMilestoneId, validMilestoneId2]);
      }
    });

    it('rejects an array with duplicate milestone IDs', () => {
      const result = reportMilestoneIdsSchema.safeParse([
        validMilestoneId,
        validMilestoneId,
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('لا يجوز تكرار معرفات المحطات المرتبطة');
      }
    });

    it('rejects an array containing non-CUID strings', () => {
      const result = reportMilestoneIdsSchema.safeParse(['invalid-id-format']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('غير صالح');
      }
    });
  });

  describe('linkProgressReportSchema', () => {
    it('accepts valid payload with milestoneId and reportId (projectId omitted)', () => {
      const result = linkProgressReportSchema.safeParse({
        milestoneId: validMilestoneId,
        reportId: validReportId,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.milestoneId).toBe(validMilestoneId);
        expect(result.data.reportId).toBe(validReportId);
        expect(result.data.projectId).toBeUndefined();
      }
    });

    it('accepts valid payload including optional projectId', () => {
      const result = linkProgressReportSchema.safeParse({
        projectId: validProjectId,
        milestoneId: validMilestoneId,
        reportId: validReportId,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe(validProjectId);
      }
    });

    it('rejects payload missing milestoneId', () => {
      const result = linkProgressReportSchema.safeParse({
        reportId: validReportId,
      });
      expect(result.success).toBe(false);
    });

    it('rejects payload missing reportId', () => {
      const result = linkProgressReportSchema.safeParse({
        milestoneId: validMilestoneId,
      });
      expect(result.success).toBe(false);
    });

    it('rejects payload with invalid CUID format', () => {
      const result = linkProgressReportSchema.safeParse({
        milestoneId: 'not-a-cuid',
        reportId: validReportId,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unlinkProgressReportSchema', () => {
    it('accepts valid payload with milestoneId and reportId', () => {
      const result = unlinkProgressReportSchema.safeParse({
        milestoneId: validMilestoneId,
        reportId: validReportId,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid payload including optional projectId', () => {
      const result = unlinkProgressReportSchema.safeParse({
        projectId: validProjectId,
        milestoneId: validMilestoneId,
        reportId: validReportId,
      });
      expect(result.success).toBe(true);
    });

    it('rejects payload missing reportId', () => {
      const result = unlinkProgressReportSchema.safeParse({
        milestoneId: validMilestoneId,
      });
      expect(result.success).toBe(false);
    });
  });
});
