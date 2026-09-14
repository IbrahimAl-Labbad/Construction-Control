/**
 * tests/unit/lib/password.test.ts
 *
 * Unit tests for Argon2id password hashing and verification.
 */

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('Argon2id Password Hashing', () => {
  it('hashes password and verifies successfully with correct plaintext', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');

    const isMatch = await verifyPassword(hash, password);
    expect(isMatch).toBe(true);
  });

  it('rejects incorrect password against valid hash', async () => {
    const password = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(hash, wrongPassword);
    expect(isMatch).toBe(false);
  });

  it('handles invalid or corrupted hash format safely without throwing', async () => {
    const isMatch = await verifyPassword('not-a-valid-argon-hash', 'test');
    expect(isMatch).toBe(false);
  });

  it('produces distinct salt hashes for identical passwords', async () => {
    const password = 'SamePasswordToHash';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(hash1, password)).toBe(true);
    expect(await verifyPassword(hash2, password)).toBe(true);
  });
});
