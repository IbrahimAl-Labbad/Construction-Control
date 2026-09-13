/**
 * lib/permissions/roles.ts
 *
 * Role constants, type guards, and role metadata.
 *
 * The four roles are defined in the Prisma schema (Role enum).
 * This module provides runtime utilities for working with roles.
 *
 * See AGENTS.md §5 for role definitions.
 * See AGENTS.md §6 for authorization principles.
 */

import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Role constants — re-exported for convenience
// ---------------------------------------------------------------------------

export { Role };

// ---------------------------------------------------------------------------
// Role display metadata (used in UI — Arabic-first)
// ---------------------------------------------------------------------------

export interface RoleMetadata {
  /** Arabic display name */
  labelAr: string;
  /** English display name (fallback) */
  labelEn: string;
  /** Role description in Arabic */
  descriptionAr: string;
}

export const ROLE_METADATA: Record<Role, RoleMetadata> = {
  [Role.MANAGER]: {
    labelAr: 'المدير',
    labelEn: 'Manager',
    descriptionAr: 'يعتمد المطالبات ويطّلع على التقارير التنفيذية',
  },
  [Role.ENGINEER]: {
    labelAr: 'المهندس الميداني',
    labelEn: 'Site Engineer',
    descriptionAr: 'يرفع تقارير التقدم ومطالبات المصروفات',
  },
  [Role.ACCOUNTANT]: {
    labelAr: 'المحاسب',
    labelEn: 'Accountant',
    descriptionAr: 'يسجّل المصروفات ويتابع العهد والمدفوعات',
  },
  [Role.PURCHASING]: {
    labelAr: 'مسؤول المشتريات',
    labelEn: 'Purchasing Officer',
    descriptionAr: 'ينشئ طلبات الشراء ويدير الموردين',
  },
} as const;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns true if the value is a valid Role enum member.
 */
export function isValidRole(value: unknown): value is Role {
  return Object.values(Role).includes(value as Role);
}

/**
 * Returns true if the given role is MANAGER.
 */
export function isManager(role: Role): boolean {
  return role === Role.MANAGER;
}

/**
 * Returns true if the given role is ENGINEER.
 */
export function isEngineer(role: Role): boolean {
  return role === Role.ENGINEER;
}

/**
 * Returns true if the given role is ACCOUNTANT.
 */
export function isAccountant(role: Role): boolean {
  return role === Role.ACCOUNTANT;
}

/**
 * Returns true if the given role is PURCHASING.
 */
export function isPurchasing(role: Role): boolean {
  return role === Role.PURCHASING;
}
