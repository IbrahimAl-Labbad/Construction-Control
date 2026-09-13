/**
 * tests/unit/lib/permissions.test.ts
 *
 * Unit tests for roles, metadata, and permission guards.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  Role,
  ROLE_METADATA,
  isAccountant,
  isEngineer,
  isManager,
  isPurchasing,
  isValidRole,
} from '@/lib/permissions/roles';
import { PermissionError, requireRole, hasRole } from '@/lib/permissions/guards';
import * as sessionModule from '@/lib/auth/session';

describe('Role helpers and metadata', () => {
  it('identifies valid roles correctly', () => {
    expect(isValidRole(Role.MANAGER)).toBe(true);
    expect(isValidRole(Role.ENGINEER)).toBe(true);
    expect(isValidRole(Role.ACCOUNTANT)).toBe(true);
    expect(isValidRole(Role.PURCHASING)).toBe(true);
    expect(isValidRole('INVALID_ROLE')).toBe(false);
    expect(isValidRole(null)).toBe(false);
  });

  it('tests role predicate functions', () => {
    expect(isManager(Role.MANAGER)).toBe(true);
    expect(isManager(Role.ENGINEER)).toBe(false);

    expect(isEngineer(Role.ENGINEER)).toBe(true);
    expect(isEngineer(Role.MANAGER)).toBe(false);

    expect(isAccountant(Role.ACCOUNTANT)).toBe(true);
    expect(isAccountant(Role.PURCHASING)).toBe(false);

    expect(isPurchasing(Role.PURCHASING)).toBe(true);
    expect(isPurchasing(Role.ACCOUNTANT)).toBe(false);
  });

  it('provides Arabic and English metadata for all 4 roles', () => {
    const roles = [Role.MANAGER, Role.ENGINEER, Role.ACCOUNTANT, Role.PURCHASING];
    for (const role of roles) {
      const meta = ROLE_METADATA[role];
      expect(meta).toBeDefined();
      expect(meta.labelAr.length).toBeGreaterThan(0);
      expect(meta.labelEn.length).toBeGreaterThan(0);
      expect(meta.descriptionAr.length).toBeGreaterThan(0);
    }
  });
});

describe('Permission Guards', () => {
  it('throws PermissionError when user does not have the required role', async () => {
    vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
      id: 'user-1',
      email: 'engineer@example.com',
      name: 'Eng 1',
      role: Role.ENGINEER,
      isActive: true,
    });

    await expect(requireRole(Role.MANAGER)).rejects.toThrow(PermissionError);
  });

  it('resolves authenticated user when role matches', async () => {
    const mockUser = {
      id: 'mgr-1',
      email: 'manager@example.com',
      name: 'Manager 1',
      role: Role.MANAGER,
      isActive: true,
    };
    vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue(mockUser);

    const user = await requireRole(Role.MANAGER);
    expect(user).toEqual(mockUser);
  });

  it('resolves authenticated user when user role matches one of allowed array', async () => {
    const mockUser = {
      id: 'acc-1',
      email: 'acc@example.com',
      name: 'Accountant 1',
      role: Role.ACCOUNTANT,
      isActive: true,
    };
    vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue(mockUser);

    const user = await requireRole([Role.MANAGER, Role.ACCOUNTANT]);
    expect(user).toEqual(mockUser);
  });

  it('hasRole returns true if authorized, false otherwise', async () => {
    vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
      id: 'eng-1',
      email: 'eng@example.com',
      name: 'Eng 1',
      role: Role.ENGINEER,
      isActive: true,
    });

    expect(await hasRole(Role.ENGINEER)).toBe(true);
    expect(await hasRole(Role.MANAGER)).toBe(false);
  });
});
