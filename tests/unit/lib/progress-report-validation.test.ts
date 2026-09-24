import { describe, it, expect } from 'vitest';
import {
  createProgressReportDraftSchema,
  updateProgressReportDraftSchema,
  rejectProgressReportSchema,
  cancelProgressReportSchema,
  reportDateSchema,
  progressPercentageSchema,
} from '@/lib/validation/schemas/progress-report';

describe('ProgressReport Validation Schemas', () => {
  describe('reportDateSchema (BD-05, BD-05b)', () => {
    it('accepts today date', () => {
      const today = new Date();
      const res = reportDateSchema.safeParse(today);
      expect(res.success).toBe(true);
    });

    it('accepts past date', () => {
      const past = new Date('2025-01-01');
      const res = reportDateSchema.safeParse(past);
      expect(res.success).toBe(true);
    });

    it('accepts tomorrow date (+1 day server-side tolerance)', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const res = reportDateSchema.safeParse(tomorrow);
      expect(res.success).toBe(true);
    });

    it('rejects dates beyond 1 day in the future with exact Arabic error', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      const res = reportDateSchema.safeParse(future);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error!.issues[0]!.message).toContain('لا يمكن أن يتجاوز تاريخ الغد');
      }
    });

    it('parses YYYY-MM-DD string cleanly', () => {
      const res = reportDateSchema.safeParse('2025-06-15');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBeInstanceOf(Date);
      }
    });
  });

  describe('progressPercentageSchema (BD-10)', () => {
    it('accepts valid integers 0 to 100', () => {
      expect(progressPercentageSchema.safeParse(0).success).toBe(true);
      expect(progressPercentageSchema.safeParse(50).success).toBe(true);
      expect(progressPercentageSchema.safeParse(100).success).toBe(true);
      expect(progressPercentageSchema.safeParse(null).success).toBe(true);
      expect(progressPercentageSchema.safeParse(undefined).success).toBe(true);
    });

    it('rejects numbers < 0 or > 100', () => {
      expect(progressPercentageSchema.safeParse(-1).success).toBe(false);
      expect(progressPercentageSchema.safeParse(101).success).toBe(false);
    });

    it('rejects decimal fractions', () => {
      const res = progressPercentageSchema.safeParse(45.5);
      expect(res.success).toBe(false);
    });
  });

  describe('createProgressReportDraftSchema', () => {
    const validPayload = {
      projectId: 'clh1234567890123456789012',
      reportDate: '2025-05-10',
      title: 'تقرير الأعمال الميدانية اليومية',
      workDescription: 'تم الانتهاء من صب خرسانة القواعد المسلحة بالكامل.',
      progressPercentage: 45,
      blockers: 'لا توجد معوقات تشغيلية حالياً.',
      nextPeriodPlan: 'البدء في أعمال عزل القواعد المسلحة.',
      weatherCondition: 'صحو',
    };

    it('accepts a fully populated valid payload', () => {
      const res = createProgressReportDraftSchema.safeParse(validPayload);
      expect(res.success).toBe(true);
    });

    it('accepts minimal payload with only required fields', () => {
      const minimal = {
        projectId: 'clh1234567890123456789012',
        reportDate: '2025-05-10',
        title: 'تقرير مختصر',
        workDescription: 'متابعة أعمال الموقع.',
      };
      const res = createProgressReportDraftSchema.safeParse(minimal);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.progressPercentage).toBeUndefined();
        expect(res.data.blockers ?? null).toBeNull();
      }
    });

    it('rejects missing or empty title', () => {
      const invalid = { ...validPayload, title: '   ' };
      const res = createProgressReportDraftSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects title longer than 150 characters', () => {
      const invalid = { ...validPayload, title: 'أ'.repeat(151) };
      const res = createProgressReportDraftSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects missing workDescription', () => {
      const invalid = { ...validPayload, workDescription: '' };
      const res = createProgressReportDraftSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects workDescription longer than 3000 characters', () => {
      const invalid = { ...validPayload, workDescription: 'أ'.repeat(3001) };
      const res = createProgressReportDraftSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('converts empty strings in optional fields to null', () => {
      const payload = {
        ...validPayload,
        blockers: '   ',
        nextPeriodPlan: '',
        weatherCondition: ' ',
      };
      const res = createProgressReportDraftSchema.safeParse(payload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.blockers).toBeNull();
        expect(res.data.nextPeriodPlan).toBeNull();
        expect(res.data.weatherCondition).toBeNull();
      }
    });
  });

  describe('rejectProgressReportSchema', () => {
    it('accepts rejection with reason or without reason (optional text)', () => {
      expect(rejectProgressReportSchema.safeParse({ rejectionReason: 'بحاجة لتعديل' }).success).toBe(true);
      expect(rejectProgressReportSchema.safeParse({ rejectionReason: null }).success).toBe(true);
      expect(rejectProgressReportSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('updateProgressReportDraftSchema', () => {
    it('accepts partial updates', () => {
      const res = updateProgressReportDraftSchema.safeParse({
        title: 'تعديل العنوان فقط',
        progressPercentage: 55,
      });
      expect(res.success).toBe(true);
    });
  });

  describe('cancelProgressReportSchema', () => {
    it('accepts cancellation with reason or without reason', () => {
      expect(cancelProgressReportSchema.safeParse({ cancellationReason: 'تم الإلغاء' }).success).toBe(true);
      expect(cancelProgressReportSchema.safeParse({}).success).toBe(true);
    });
  });
});
