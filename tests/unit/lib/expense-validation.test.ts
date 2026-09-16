/**
 * tests/unit/lib/expense-validation.test.ts
 *
 * Unit tests for Expense Zod validation schemas.
 * Covers money amounts, expense dates, creation, updates, and rejection schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  expenseIdSchema,
  expenseDateSchema,
  createExpenseDraftSchema,
  updateExpenseDraftSchema,
  rejectExpenseSchema,
  moneyAmountSchema,
} from '@/lib/validation/schemas/expense';

describe('expenseIdSchema', () => {
  it('accepts valid CUIDs', () => {
    const validCuid = 'cju0123456789abcdef012345';
    const result = expenseIdSchema.safeParse(validCuid);
    expect(result.success).toBe(true);
  });

  it('rejects empty and invalid IDs', () => {
    expect(expenseIdSchema.safeParse('').success).toBe(false);
    expect(expenseIdSchema.safeParse('not-a-cuid').success).toBe(false);
  });
});

describe('moneyAmountSchema', () => {
  it('accepts valid monetary strings', () => {
    expect(moneyAmountSchema.safeParse('100').success).toBe(true);
    expect(moneyAmountSchema.safeParse('1500.50').success).toBe(true);
    expect(moneyAmountSchema.safeParse('0.05').success).toBe(true);
    expect(moneyAmountSchema.safeParse('9999999.99').success).toBe(true);
  });

  it('rejects zero and negative amounts', () => {
    expect(moneyAmountSchema.safeParse('0').success).toBe(false);
    expect(moneyAmountSchema.safeParse('0.00').success).toBe(false);
    expect(moneyAmountSchema.safeParse('-100').success).toBe(false);
    expect(moneyAmountSchema.safeParse('-0.50').success).toBe(false);
  });

  it('rejects more than 2 decimal places', () => {
    expect(moneyAmountSchema.safeParse('100.123').success).toBe(false);
    expect(moneyAmountSchema.safeParse('50.001').success).toBe(false);
  });

  it('rejects invalid numeric strings and alphabetic input', () => {
    expect(moneyAmountSchema.safeParse('abc').success).toBe(false);
    expect(moneyAmountSchema.safeParse('100 SAR').success).toBe(false);
    expect(moneyAmountSchema.safeParse('').success).toBe(false);
  });
});

describe('expenseDateSchema', () => {
  it('accepts past and current dates', () => {
    const today = new Date();
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(expenseDateSchema.safeParse(today).success).toBe(true);
    expect(expenseDateSchema.safeParse(past).success).toBe(true);
    expect(expenseDateSchema.safeParse(past.toISOString()).success).toBe(true);
    expect(expenseDateSchema.safeParse('2026-01-15').success).toBe(true);
  });

  it('rejects dates in the distant future', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = expenseDateSchema.safeParse(futureDate);
    expect(result.success).toBe(false);
  });

  it('rejects invalid date formats', () => {
    expect(expenseDateSchema.safeParse('invalid-date').success).toBe(false);
  });
});

describe('createExpenseDraftSchema', () => {
  const validPayload = {
    projectId: 'cju0123456789abcdef012345',
    budgetLineId: 'cju0123456789abcdef012346',
    amount: '2500.00',
    expenseDate: new Date(),
    description: 'شراء أدوات سلامة للموقع',
  };

  it('validates a valid draft payload', () => {
    const result = createExpenseDraftSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects description shorter than 3 characters', () => {
    const result = createExpenseDraftSchema.safeParse({
      ...validPayload,
      description: 'أد',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing or invalid CUIDs', () => {
    expect(
      createExpenseDraftSchema.safeParse({ ...validPayload, projectId: 'invalid' }).success,
    ).toBe(false);
    expect(
      createExpenseDraftSchema.safeParse({ ...validPayload, budgetLineId: '' }).success,
    ).toBe(false);
  });
});

describe('updateExpenseDraftSchema', () => {
  const validUpdate = {
    budgetLineId: 'cju0123456789abcdef012346',
    amount: '3200.75',
    expenseDate: '2026-03-10',
    description: 'تعديل: توريد معدات حفر إضافية',
  };

  it('validates a valid update payload', () => {
    const result = updateExpenseDraftSchema.safeParse(validUpdate);
    expect(result.success).toBe(true);
  });

  it('rejects invalid amount', () => {
    expect(
      updateExpenseDraftSchema.safeParse({ ...validUpdate, amount: '-500' }).success,
    ).toBe(false);
  });
});

describe('rejectExpenseSchema', () => {
  it('accepts valid rejection reasons', () => {
    const result = rejectExpenseSchema.safeParse({
      rejectionReason: 'الفاتورة غير واضحة وبحاجة لإعادة تصوير',
    });
    expect(result.success).toBe(true);
  });

  it('rejects reasons shorter than 3 characters or whitespace-only', () => {
    expect(rejectExpenseSchema.safeParse({ rejectionReason: 'لا' }).success).toBe(false);
    expect(rejectExpenseSchema.safeParse({ rejectionReason: '    ' }).success).toBe(false);
  });

  it('rejects reasons exceeding 500 characters', () => {
    const longReason = 'أ'.repeat(501);
    expect(rejectExpenseSchema.safeParse({ rejectionReason: longReason }).success).toBe(false);
  });
});
