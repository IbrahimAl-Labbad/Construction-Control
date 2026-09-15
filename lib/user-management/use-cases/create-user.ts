/**
 * lib/user-management/use-cases/create-user.ts
 *
 * Use case: Manager creates a new user account with a hashed credential.
 *
 * Authorization: MANAGER only (enforced in this use case).
 * Validation: createUserSchema (Zod) — email normalized, role validated.
 * Security:
 *   - Password hashed with Argon2id before storage.
 *   - passwordHash is NEVER returned — select excludes it.
 *   - Email uniqueness checked before creation.
 * Transaction: User + Credential + AuditLog created atomically.
 *
 * See AGENTS.md §7 for use case rules.
 * See AGENTS.md §17 for password and audit rules.
 */

import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { createUserSchema } from '@/lib/validation/schemas/user';

import type { UserSummary } from '../types';

/**
 * Creates a new user account with a hashed credential.
 *
 * The `rawInput` parameter is validated internally — callers must pass
 * untrusted data; the use case is the validation authority.
 *
 * @param rawInput - Unvalidated user creation input from the server action
 * @returns The created user as a safe UserSummary (no passwordHash)
 * @throws {AuthError} if not authenticated
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if input fails schema validation
 * @throws {AppError} ALREADY_EXISTS if the email is taken
 */
export async function createUser(rawInput: unknown): Promise<UserSummary> {
  // 1. Authorization — MANAGER only (defense-in-depth)
  const actor = await requireManager();

  // 2. Validate input — use case is the validation authority
  const validation = validate(createUserSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const { name, email, role, password } = validation.data;

  // 3. Email uniqueness — checked before hashing to fail fast
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('ALREADY_EXISTS', 'البريد الإلكتروني مستخدم بالفعل');
  }

  // 4. Hash password — NEVER store plaintext
  const passwordHash = await hashPassword(password);

  // 5. Atomic transaction: User + Credential + AuditLog
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await tx.credential.create({
      data: { userId: user.id, passwordHash },
    });

    // Audit: log WHO created WHOM — never log password or hash
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          targetName: user.name,
          targetEmail: user.email,
          targetRole: user.role,
        },
      },
    });

    return user;
  });

  // passwordHash is excluded by the select — safe to return
  return created;
}
