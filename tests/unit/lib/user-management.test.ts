/**
 * tests/unit/lib/user-management.test.ts
 *
 * Unit tests for user management use cases:
 * - listUsers
 * - createUser
 * - deactivateUser
 * - reactivateUser
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

import {
  listUsers,
  createUser,
  deactivateUser,
  reactivateUser,
} from '@/lib/user-management';
import { prisma } from '@/lib/db/prisma';
import * as permissions from '@/lib/permissions';
import * as passwordModule from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions/guards';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('User Management Use Cases', () => {
  const mockManager: AuthenticatedUser = {
    id: 'manager-123',
    name: 'مدير النظام',
    email: 'manager@test.local',
    role: Role.MANAGER,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUser', () => {
    const validInput = {
      name: 'مهندس جديد',
      email: 'engineer.new@test.local',
      role: 'ENGINEER' as const,
      password: 'SecurePassword123!',
    };

    it('throws PermissionError if actor is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(createUser(validInput)).rejects.toThrow(PermissionError);
    });

    it('throws ValidationError when input is invalid', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      await expect(
        createUser({ ...validInput, email: 'not-an-email' }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ALREADY_EXISTS when email is already taken', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
        { id: 'existing-user' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>,
      );

      await expect(createUser(validInput)).rejects.toThrow(
        expect.objectContaining({ code: 'ALREADY_EXISTS' }),
      );
    });

    it('hashes password and creates User + Credential + AuditLog atomically in transaction', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(passwordModule, 'hashPassword').mockResolvedValue('argon2id_mock_hash');

      const mockCreatedUser = {
        id: 'new-user-456',
        name: validInput.name,
        email: validInput.email.toLowerCase(),
        role: Role.ENGINEER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTx = {
        user: {
          create: vi.fn().mockResolvedValue(mockCreatedUser),
        },
        credential: {
          create: vi.fn().mockResolvedValue({ id: 'cred-1' }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: unknown) => {
        return (callback as (tx: unknown) => unknown)(mockTx) as never;
      });

      const result = await createUser(validInput);

      expect(passwordModule.hashPassword).toHaveBeenCalledWith(validInput.password);
      expect(mockTx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: validInput.name,
            email: validInput.email.toLowerCase(),
            role: 'ENGINEER',
          }),
        }),
      );
      expect(mockTx.credential.create).toHaveBeenCalledWith({
        data: {
          userId: 'new-user-456',
          passwordHash: 'argon2id_mock_hash',
        },
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: mockManager.id,
          action: 'USER_CREATED',
          entityType: 'USER',
          entityId: 'new-user-456',
          metadata: {
            targetName: validInput.name,
            targetEmail: validInput.email.toLowerCase(),
            targetRole: 'ENGINEER',
          },
        },
      });
      expect(result).toEqual(mockCreatedUser);
      // Ensure passwordHash is never returned
      expect((result as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
    });
  });

  describe('deactivateUser', () => {
    it('throws PermissionError if actor is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(deactivateUser('target-user-1')).rejects.toThrow(PermissionError);
    });

    it('throws ValidationError for empty target user ID', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      await expect(deactivateUser('')).rejects.toThrow(ValidationError);
    });

    it('prevents Manager from deactivating their own account (FORBIDDEN)', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      await expect(deactivateUser(mockManager.id)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('throws NOT_FOUND if user does not exist or is soft-deleted', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      await expect(deactivateUser('non-existent-user')).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('is idempotent: returns current user without writing when already inactive', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      const inactiveUser = {
        id: 'user-inactive',
        name: 'مستخدم معطل',
        email: 'inactive@test.local',
        role: Role.ENGINEER,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(
        inactiveUser as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>,
      );
      const txSpy = vi.spyOn(prisma, '$transaction');

      const result = await deactivateUser('user-inactive');

      expect(result).toEqual(inactiveUser);
      expect(txSpy).not.toHaveBeenCalled();
    });

    it('deactivates active user and logs USER_DEACTIVATED audit log', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      const activeUser = {
        id: 'user-active',
        name: 'مستخدم نشط',
        email: 'active@test.local',
        role: Role.ENGINEER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(
        activeUser as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>,
      );

      const updatedUser = { ...activeUser, isActive: false };
      const mockTx = {
        user: { update: vi.fn().mockResolvedValue(updatedUser) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-2' }) },
      };
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: unknown) => {
        return (callback as (tx: unknown) => unknown)(mockTx) as never;
      });

      const result = await deactivateUser('user-active');

      expect(result.isActive).toBe(false);
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-active' },
        data: { isActive: false },
        select: expect.any(Object),
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: mockManager.id,
          action: 'USER_DEACTIVATED',
          entityType: 'USER',
          entityId: 'user-active',
          metadata: {
            targetName: activeUser.name,
            targetEmail: activeUser.email,
          },
        },
      });
    });
  });

  describe('reactivateUser', () => {
    it('throws PermissionError if actor is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(reactivateUser('target-user-1')).rejects.toThrow(PermissionError);
    });

    it('throws NOT_FOUND if user does not exist or is soft-deleted', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      await expect(reactivateUser('unknown-id')).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('is idempotent: returns current user without writing when already active', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      const activeUser = {
        id: 'user-already-active',
        name: 'مستخدم نشط',
        email: 'active@test.local',
        role: Role.ENGINEER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(
        activeUser as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>,
      );
      const txSpy = vi.spyOn(prisma, '$transaction');

      const result = await reactivateUser('user-already-active');

      expect(result).toEqual(activeUser);
      expect(txSpy).not.toHaveBeenCalled();
    });

    it('reactivates inactive user and logs USER_REACTIVATED audit log', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      const inactiveUser = {
        id: 'user-inactive',
        name: 'مستخدم معطل',
        email: 'inactive@test.local',
        role: Role.ENGINEER,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(
        inactiveUser as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>,
      );

      const updatedUser = { ...inactiveUser, isActive: true };
      const mockTx = {
        user: { update: vi.fn().mockResolvedValue(updatedUser) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-3' }) },
      };
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: unknown) => {
        return (callback as (tx: unknown) => unknown)(mockTx) as never;
      });

      const result = await reactivateUser('user-inactive');

      expect(result.isActive).toBe(true);
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-inactive' },
        data: { isActive: true },
        select: expect.any(Object),
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: mockManager.id,
          action: 'USER_REACTIVATED',
          entityType: 'USER',
          entityId: 'user-inactive',
          metadata: {
            targetName: inactiveUser.name,
            targetEmail: inactiveUser.email,
          },
        },
      });
    });
  });

  describe('listUsers', () => {
    it('throws PermissionError if actor is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(listUsers()).rejects.toThrow(PermissionError);
    });

    it('returns users excluding soft-deleted records', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      const mockUsers = [
        {
          id: 'u1',
          name: 'المستخدم 1',
          email: 'u1@test.local',
          role: Role.ENGINEER,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const findManySpy = vi.spyOn(prisma.user, 'findMany').mockResolvedValue(
        mockUsers as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>,
      );

      const result = await listUsers();

      expect(result).toEqual(mockUsers);
      expect(findManySpy).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
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
    });
  });
});
