/**
 * lib/auth/index.ts
 *
 * Public barrel export for the auth module.
 * Import auth utilities from '@/lib/auth', not from individual files.
 */

export { authOptions } from './config';
export { getSession, getCurrentUser, requireAuth, AuthError } from './session';
export type { AuthenticatedUser, AuthenticatedSession } from './types';
export type { AuthErrorCode } from './session';
