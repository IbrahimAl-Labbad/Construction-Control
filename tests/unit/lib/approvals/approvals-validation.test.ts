import { describe, it, expect } from 'vitest';

function validateRejectionReason(reason: unknown): { valid: boolean; error?: string } {
  if (typeof reason !== 'string') {
    return { valid: false, error: 'سبب الرفض غير صالح' };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: 'سبب الرفض يجب أن يكون 3 أحرف على الأقل' };
  }
  if (reason.length > 500) {
    return { valid: false, error: 'سبب الرفض لا يمكن أن يتجاوز 500 حرف' };
  }
  return { valid: true };
}

describe('Approvals Hub Validation (Unit)', () => {
  it('rejects rejection reasons shorter than 3 characters', () => {
    expect(validateRejectionReason('').valid).toBe(false);
    expect(validateRejectionReason('ab').valid).toBe(false);
    expect(validateRejectionReason('لا').valid).toBe(false);
  });

  it('accepts rejection reason with exactly 3 characters', () => {
    expect(validateRejectionReason('abc').valid).toBe(true);
    expect(validateRejectionReason('رفض').valid).toBe(true);
  });

  it('accepts rejection reason with exactly 500 characters', () => {
    const reason500 = 'أ'.repeat(500);
    expect(validateRejectionReason(reason500).valid).toBe(true);
  });

  it('rejects rejection reasons exceeding 500 characters', () => {
    const reason501 = 'أ'.repeat(501);
    expect(validateRejectionReason(reason501).valid).toBe(false);
  });

  it('rejects whitespace-only reasons', () => {
    expect(validateRejectionReason('   ').valid).toBe(false);
    expect(validateRejectionReason('\t\n  ').valid).toBe(false);
  });
});
