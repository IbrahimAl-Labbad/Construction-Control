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
} from '@/lib/validation/schemas/milestone';

describe('Milestone Validation Schemas (Unit Tests)', () => {
  const validProjectId = 'cjld2cjxh0000qzrmn831i7rn';
  const validMilestoneId = 'cjld2cjxh0001qzrmn831i7rn';
  const validMilestoneId2 = 'cjld2cjxh0002qzrmn831i7rn';

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
});
