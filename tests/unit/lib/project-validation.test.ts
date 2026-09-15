/**
 * tests/unit/lib/project-validation.test.ts
 *
 * Unit tests for Project validation schemas:
 * - projectCodeSchema
 * - projectNameSchema
 * - createProjectSchema
 * - projectIdSchema
 */

import { describe, expect, it } from 'vitest';
import {
  projectCodeSchema,
  projectNameSchema,
  createProjectSchema,
  projectIdSchema,
} from '@/lib/validation/schemas/project';

describe('projectCodeSchema', () => {
  it('accepts valid project codes and normalizes them to uppercase', () => {
    const validCodes = ['PRJ-001', 'prj-002', 'site_a', 'P-123_XYZ'];
    for (const code of validCodes) {
      const result = projectCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(code.trim().toUpperCase());
      }
    }
  });

  it('rejects codes shorter than 2 characters', () => {
    const result = projectCodeSchema.safeParse('A');
    expect(result.success).toBe(false);
  });

  it('rejects codes longer than 20 characters', () => {
    const result = projectCodeSchema.safeParse('A'.repeat(21));
    expect(result.success).toBe(false);
  });

  it('rejects codes with special symbols not allowed', () => {
    const invalidCodes = ['PRJ#1', 'PRJ 001', 'PRJ@A', 'مشروع-1'];
    for (const code of invalidCodes) {
      const result = projectCodeSchema.safeParse(code);
      expect(result.success).toBe(false);
    }
  });
});

describe('projectNameSchema', () => {
  it('accepts valid Arabic and bilingual names and trims them', () => {
    const result = projectNameSchema.safeParse('   مشروع برج الرياض السكني   ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('مشروع برج الرياض السكني');
    }
  });

  it('rejects names shorter than 2 characters', () => {
    expect(projectNameSchema.safeParse('أ').success).toBe(false);
    expect(projectNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects names longer than 150 characters', () => {
    expect(projectNameSchema.safeParse('م'.repeat(151)).success).toBe(false);
  });
});

describe('createProjectSchema', () => {
  const validProjectInput = {
    code: 'PRJ-RYD-01',
    name: 'مشروع إنشاء مبنى المقر الرئيسي',
    description: 'مشروع إنشاء وتجهيز مبنى متكامل',
    location: 'الرياض - حي الملز',
    managerId: 'cuid_manager_123',
    startDate: '2026-10-01',
    endDate: '2027-10-01',
  };

  it('accepts fully populated valid project input', () => {
    const result = createProjectSchema.safeParse(validProjectInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('PRJ-RYD-01');
      expect(result.data.name).toBe('مشروع إنشاء مبنى المقر الرئيسي');
      expect(result.data.managerId).toBe('cuid_manager_123');
      expect(result.data.startDate).toBeInstanceOf(Date);
      expect(result.data.endDate).toBeInstanceOf(Date);
    }
  });

  it('accepts minimal input without optional fields', () => {
    const result = createProjectSchema.safeParse({
      code: 'prj-min',
      name: 'مشروع أساسي',
      managerId: 'cuid_mgr',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('PRJ-MIN');
      expect(result.data.description).toBeNull();
      expect(result.data.location).toBeNull();
      expect(result.data.startDate).toBeNull();
      expect(result.data.endDate).toBeNull();
    }
  });

  it('converts empty strings for optional fields to null', () => {
    const result = createProjectSchema.safeParse({
      code: 'PRJ-EMPTY',
      name: 'مشروع تجريبي',
      description: '   ',
      location: '',
      managerId: 'cuid_mgr',
      startDate: '',
      endDate: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
      expect(result.data.location).toBeNull();
      expect(result.data.startDate).toBeNull();
      expect(result.data.endDate).toBeNull();
    }
  });

  it('rejects if endDate is before startDate', () => {
    const result = createProjectSchema.safeParse({
      ...validProjectInput,
      startDate: '2027-01-01',
      endDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('endDate');
    }
  });

  it('allows endDate equal to startDate', () => {
    const result = createProjectSchema.safeParse({
      ...validProjectInput,
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects if managerId is missing or empty', () => {
    const result = createProjectSchema.safeParse({
      ...validProjectInput,
      managerId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('projectIdSchema', () => {
  it('accepts non-empty strings', () => {
    expect(projectIdSchema.safeParse('cuid_123').success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(projectIdSchema.safeParse('').success).toBe(false);
  });
});
