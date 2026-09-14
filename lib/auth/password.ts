/**
 * lib/auth/password.ts
 *
 * Cryptographic password hashing and verification using Argon2id.
 *
 * Follows OWASP recommendations for password storage:
 * - Algorithm: Argon2id
 * - Memory cost: 64 MB (65536 KB)
 * - Time cost / iterations: 3
 * - Parallelism: 4 threads
 *
 * See AGENTS.md §17 for authentication rules.
 */

import * as argon2 from 'argon2';

/**
 * Argon2id hashing options adhering to OWASP recommendations.
 */
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 threads
};

/**
 * Hashes a plaintext password using Argon2id.
 *
 * @param password - Plaintext password to hash
 * @returns Argon2id hashed string
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Constant-time comparison is handled internally by argon2.
 *
 * @param hash - Stored password hash
 * @param plain - Plaintext password candidate
 * @returns True if password matches the hash, false otherwise
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
