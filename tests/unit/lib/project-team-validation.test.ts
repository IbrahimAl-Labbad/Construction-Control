import { describe, expect, it } from 'vitest';
import {
  projectIdSchema,
  engineerIdSchema,
  assignmentIdSchema,
  assignEngineerSchema,
  removeEngineerSchema,
} from '@/lib/validation/schemas/project-team';

describe('Project Team Validation Schemas (Unit)', () => {
  const validCuid1 = 'clh1234567890abcdefghijkl';
  const validCuid2 = 'clh0987654321zyxwvutsrqpo';
  const validCuid3 = 'clh5555555555mmmmmmmmmmmm';

  describe('CUID Identifier Schemas', () => {
    it('accepts valid CUID strings', () => {
      expect(projectIdSchema.safeParse(validCuid1).success).toBe(true);
      expect(engineerIdSchema.safeParse(validCuid2).success).toBe(true);
      expect(assignmentIdSchema.safeParse(validCuid3).success).toBe(true);
    });

    it('rejects non-CUID strings', () => {
      expect(projectIdSchema.safeParse('not-a-cuid').success).toBe(false);
      expect(engineerIdSchema.safeParse('12345').success).toBe(false);
      expect(assignmentIdSchema.safeParse('user-abc').success).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(projectIdSchema.safeParse('').success).toBe(false);
      expect(engineerIdSchema.safeParse('   ').success).toBe(false);
      expect(assignmentIdSchema.safeParse('').success).toBe(false);
    });
  });

  describe('assignEngineerSchema', () => {
    it('validates a correct payload without reason', () => {
      const res = assignEngineerSchema.safeParse({
        projectId: validCuid1,
        engineerId: validCuid2,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBeNull();
      }
    });

    it('validates a correct payload with reason and normalizes whitespace', () => {
      const res = assignEngineerSchema.safeParse({
        projectId: validCuid1,
        engineerId: validCuid2,
        reason: '  تكليف إشراف ميداني على أعمال الهيكل الخرساني  ',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBe('تكليف إشراف ميداني على أعمال الهيكل الخرساني');
      }
    });

    it('normalizes blank or whitespace-only reason to null', () => {
      const res = assignEngineerSchema.safeParse({
        projectId: validCuid1,
        engineerId: validCuid2,
        reason: '   ',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBeNull();
      }
    });

    it('accepts reason up to 500 characters', () => {
      const res = assignEngineerSchema.safeParse({
        projectId: validCuid1,
        engineerId: validCuid2,
        reason: 'أ'.repeat(500),
      });
      expect(res.success).toBe(true);
    });

    it('rejects reason exceeding 500 characters', () => {
      const res = assignEngineerSchema.safeParse({
        projectId: validCuid1,
        engineerId: validCuid2,
        reason: 'أ'.repeat(501),
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid project or engineer IDs', () => {
      expect(
        assignEngineerSchema.safeParse({
          projectId: 'invalid',
          engineerId: validCuid2,
        }).success,
      ).toBe(false);

      expect(
        assignEngineerSchema.safeParse({
          projectId: validCuid1,
          engineerId: 'invalid',
        }).success,
      ).toBe(false);
    });
  });

  describe('removeEngineerSchema', () => {
    it('validates a correct payload without reason', () => {
      const res = removeEngineerSchema.safeParse({
        projectId: validCuid1,
        assignmentId: validCuid3,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBeNull();
      }
    });

    it('validates a correct payload with optional removal reason', () => {
      const res = removeEngineerSchema.safeParse({
        projectId: validCuid1,
        assignmentId: validCuid3,
        reason: 'نقل إلى مشروع آخر',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBe('نقل إلى مشروع آخر');
      }
    });

    it('normalizes blank reason to null', () => {
      const res = removeEngineerSchema.safeParse({
        projectId: validCuid1,
        assignmentId: validCuid3,
        reason: '   ',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBeNull();
      }
    });

    it('rejects removal reason exceeding 500 characters', () => {
      const res = removeEngineerSchema.safeParse({
        projectId: validCuid1,
        assignmentId: validCuid3,
        reason: 'م'.repeat(501),
      });
      expect(res.success).toBe(false);
    });
  });
});
