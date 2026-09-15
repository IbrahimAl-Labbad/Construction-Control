/**
 * lib/validation/schemas/user.ts
 *
 * Zod validation schemas for user management operations.
 *
 * These schemas are the single source of validation truth for the user
 * management domain. They are consumed exclusively by use cases — never
 * called directly from the presentation layer.
 *
 * Password policy (project-defined):
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one digit
 * - At least one special character
 *
 * See AGENTS.md §16 for validation rules.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Password policy schema
// ---------------------------------------------------------------------------

/**
 * Project password policy schema.
 * Applied to all new user creation flows.
 */
const passwordPolicySchema = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل')
  .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل')
  .regex(/[^A-Za-z0-9]/, 'كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل');

// ---------------------------------------------------------------------------
// Role validation
// ---------------------------------------------------------------------------

/**
 * The four valid roles. Must match the Role enum in schema.prisma.
 * See AGENTS.md §5 for role definitions.
 */
const VALID_ROLES = ['MANAGER', 'ENGINEER', 'ACCOUNTANT', 'PURCHASING'] as const;

const roleSchema = z.enum(VALID_ROLES, {
  error: 'الدور المحدد غير صالح',
});

// ---------------------------------------------------------------------------
// Create user schema
// ---------------------------------------------------------------------------

/**
 * Validates input for the createUser use case.
 *
 * Email is normalized (lowercased + trimmed) by the transform.
 * The output type reflects the normalized email.
 */
export const createUserSchema = z.object({
  name: z
    .string()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(100, 'الاسم لا يمكن أن يتجاوز 100 حرف'),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().email('البريد الإلكتروني غير صالح'),
  ),
  role: roleSchema,
  password: passwordPolicySchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ---------------------------------------------------------------------------
// User ID schema — for deactivate / reactivate operations
// ---------------------------------------------------------------------------

/**
 * Validates a user identifier for targeted operations.
 * Accepts any non-empty string; actual existence is verified at the DB layer.
 */
export const userIdSchema = z.string().min(1, 'معرّف المستخدم مطلوب');

export type UserIdInput = z.infer<typeof userIdSchema>;
