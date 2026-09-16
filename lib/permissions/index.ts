/**
 * lib/permissions/index.ts
 *
 * Public barrel export for the permissions module.
 * Import permissions utilities from '@/lib/permissions'.
 */

export { Role, ROLE_METADATA, isValidRole, isManager, isEngineer, isAccountant, isPurchasing } from './roles';
export type { RoleMetadata } from './roles';

export {
  requireRole,
  hasRole,
  requireManager,
  requireEngineer,
  requireAccountant,
  requirePurchasing,
  PermissionError,
} from './guards';
export type { PermissionErrorCode } from './guards';

export { requireAuth } from '@/lib/auth';
export { policies } from './policies';
