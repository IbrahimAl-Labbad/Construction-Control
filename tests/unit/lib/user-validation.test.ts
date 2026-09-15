/**
 * tests/unit/lib/user-validation.test.ts
 *
 * Unit tests for user validation schemas:
 * - createUserSchema (name, email, role, password policy)
 * - userIdSchema
 */

import { describe, expect, it } from 'vitest';
import { createUserSchema, userIdSchema } from '@/lib/validation/schemas/user';

describe('createUserSchema', () => {
  const validUser = {
    name: 'أحمد المهندس',
    email: 'ahmed@example.com',
    role: 'ENGINEER' as const,
    password: 'Password123!',
  };

  it('accepts valid user input', () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('أحمد المهندس');
      expect(result.data.email).toBe('ahmed@example.com');
      expect(result.data.role).toBe('ENGINEER');
      expect(result.data.password).toBe('Password123!');
    }
  });

  it('normalizes email by trimming and converting to lower case', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      email: '   AHMED@EXAMPLE.COM   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('ahmed@example.com');
    }
  });

  describe('name validation', () => {
    it('rejects name shorter than 2 characters', () => {
      const result = createUserSchema.safeParse({ ...validUser, name: 'أ' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('name');
      }
    });

    it('rejects name longer than 100 characters', () => {
      const longName = 'ا'.repeat(101);
      const result = createUserSchema.safeParse({ ...validUser, name: longName });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('name');
      }
    });
  });

  describe('email validation', () => {
    it('rejects invalid email formats', () => {
      const invalidEmails = ['invalid-email', 'missing@', '@missing.com', 'user@domain..com'];
      for (const email of invalidEmails) {
        const result = createUserSchema.safeParse({ ...validUser, email });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.path).toContain('email');
        }
      }
    });
  });

  describe('role validation', () => {
    it('accepts all 4 valid system roles', () => {
      const roles = ['MANAGER', 'ENGINEER', 'ACCOUNTANT', 'PURCHASING'] as const;
      for (const role of roles) {
        const result = createUserSchema.safeParse({ ...validUser, role });
        expect(result.success).toBe(true);
      }
    });

    it('rejects unrecognized roles or privilege escalation attempts', () => {
      const invalidRoles = ['SUPERADMIN', 'ADMIN', 'ROOT', 'USER', 'GUEST', ''];
      for (const role of invalidRoles) {
        const result = createUserSchema.safeParse({ ...validUser, role });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.path).toContain('role');
        }
      }
    });
  });

  describe('password policy validation', () => {
    it('rejects password shorter than 8 characters', () => {
      const result = createUserSchema.safeParse({ ...validUser, password: 'Aa1!' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('password');
      }
    });

    it('rejects password missing uppercase letter', () => {
      const result = createUserSchema.safeParse({ ...validUser, password: 'password123!' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('password');
      }
    });

    it('rejects password missing digit', () => {
      const result = createUserSchema.safeParse({ ...validUser, password: 'Password!@#' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('password');
      }
    });

    it('rejects password missing special character', () => {
      const result = createUserSchema.safeParse({ ...validUser, password: 'Password123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('password');
      }
    });
  });
});

describe('userIdSchema', () => {
  it('accepts valid user ID string', () => {
    expect(userIdSchema.safeParse('usr_123456789').success).toBe(true);
  });

  it('rejects empty user ID', () => {
    expect(userIdSchema.safeParse('').success).toBe(false);
  });
});
