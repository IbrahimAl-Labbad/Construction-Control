/**
 * lib/user-management/index.ts
 *
 * Public barrel export for the user management module.
 * Import user management functions from '@/lib/user-management'.
 */

export { listUsers } from './use-cases/list-users';
export { createUser } from './use-cases/create-user';
export { deactivateUser } from './use-cases/deactivate-user';
export { reactivateUser } from './use-cases/reactivate-user';
export type { UserSummary } from './types';
