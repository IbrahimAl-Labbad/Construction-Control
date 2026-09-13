/**
 * tests/unit/lib/validation.test.ts
 *
 * Unit tests for the validation module.
 * Tests the Zod schemas and validate() helper.
 */

import { describe, expect, it } from 'vitest';

import { moneySchema, paginationSchema, validate, dateRangeSchema } from '@/lib/validation';

describe('moneySchema', () => {
  it('accepts a valid integer amount', () => {
    expect(moneySchema.safeParse('100').success).toBe(true);
  });

  it('accepts a valid decimal amount with 2 decimal places', () => {
    expect(moneySchema.safeParse('100.00').success).toBe(true);
    expect(moneySchema.safeParse('99.99').success).toBe(true);
  });

  it('accepts a valid decimal amount with 1 decimal place', () => {
    expect(moneySchema.safeParse('50.5').success).toBe(true);
  });

  it('accepts zero', () => {
    expect(moneySchema.safeParse('0').success).toBe(true);
    expect(moneySchema.safeParse('0.00').success).toBe(true);
  });

  it('rejects a negative amount', () => {
    expect(moneySchema.safeParse('-1.00').success).toBe(false);
  });

  it('rejects more than 2 decimal places', () => {
    expect(moneySchema.safeParse('1.234').success).toBe(false);
  });

  it('rejects a numeric type (must be string)', () => {
    expect(moneySchema.safeParse(100).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(moneySchema.safeParse('').success).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(moneySchema.safeParse('abc').success).toBe(false);
    expect(moneySchema.safeParse('10,000').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('uses defaults when no values provided', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('coerces string numbers', () => {
    const result = paginationSchema.safeParse({ page: '2', pageSize: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it('rejects pageSize > 100', () => {
    expect(paginationSchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('rejects page < 1', () => {
    expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('dateRangeSchema', () => {
  it('accepts valid date range', () => {
    const result = dateRangeSchema.safeParse({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty date range', () => {
    expect(dateRangeSchema.safeParse({}).success).toBe(true);
  });

  it('rejects start date after end date', () => {
    const result = dateRangeSchema.safeParse({
      startDate: '2024-12-31',
      endDate: '2024-01-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('validate()', () => {
  it('returns success with typed data', () => {
    const result = validate(moneySchema, '100.00');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('100.00');
    }
  });

  it('returns structured errors on failure', () => {
    const result = validate(moneySchema, 'not-a-number');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('path');
      expect(result.errors[0]).toHaveProperty('message');
    }
  });
});
