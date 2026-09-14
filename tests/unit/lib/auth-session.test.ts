/**
 * tests/unit/lib/auth-session.test.ts
 *
 * Unit tests for server-side session retrieval and Option C DB session verification.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, type User, type Session } from '@prisma/client';
import * as nextAuth from 'next-auth';

import {
  getSession,
  getCurrentUser,
  requireAuth,
  AuthError,
} from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

type DbSessionWithUser = Session & {
  user: Pick<User, 'id' | 'name' | 'email' | 'image' | 'role' | 'isActive' | 'deletedAt'>;
};

describe('lib/auth/session — Option C Session Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSession & getCurrentUser', () => {
    it('returns null when no session is present', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue(null);

      expect(await getSession()).toBeNull();
      expect(await getCurrentUser()).toBeNull();
    });

    it('returns user when session exists', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          name: 'Ahmed',
          email: 'ahmed@example.com',
          role: Role.ENGINEER,
          isActive: true,
          sessionToken: 'token-abc',
        },
        expires: new Date().toISOString(),
      };
      vi.mocked(nextAuth.getServerSession).mockResolvedValue(mockSession);

      const user = await getCurrentUser();
      expect(user).toEqual(mockSession.user);
    });
  });

  describe('requireAuth', () => {
    it('throws UNAUTHENTICATED when session is null', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue(null);

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      );
    });

    it('throws UNAUTHENTICATED when session user has no sessionToken', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-1',
          name: 'Ahmed',
          role: Role.ENGINEER,
          isActive: true,
        },
        expires: new Date().toISOString(),
      });

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      );
    });

    it('throws UNAUTHENTICATED when database session record is missing (revoked)', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-1',
          sessionToken: 'revoked-token',
          role: Role.ENGINEER,
          isActive: true,
        },
        expires: new Date().toISOString(),
      });

      vi.spyOn(prisma.session, 'findUnique').mockResolvedValue(null);

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      );
    });

    it('throws UNAUTHENTICATED when database session is expired', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-1',
          sessionToken: 'expired-token',
          role: Role.ENGINEER,
          isActive: true,
        },
        expires: new Date().toISOString(),
      });

      const mockDbSession: DbSessionWithUser = {
        id: 'sess-1',
        sessionToken: 'expired-token',
        userId: 'user-1',
        expires: new Date(Date.now() - 10000), // In the past
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-1',
          name: 'Test',
          email: 'test@example.com',
          image: null,
          role: Role.ENGINEER,
          isActive: true,
          deletedAt: null,
        },
      };

      vi.spyOn(prisma.session, 'findUnique').mockResolvedValue(
        mockDbSession as unknown as Awaited<ReturnType<typeof prisma.session.findUnique>>,
      );

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      );
    });

    it('throws ACCOUNT_INACTIVE when user is disabled in database', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-disabled',
          sessionToken: 'valid-token',
          role: Role.ENGINEER,
          isActive: true, // Claims active in stale JWT
        },
        expires: new Date().toISOString(),
      });

      const mockDbSession: DbSessionWithUser = {
        id: 'sess-1',
        sessionToken: 'valid-token',
        userId: 'user-disabled',
        expires: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-disabled',
          name: 'Disabled User',
          email: 'disabled@example.com',
          image: null,
          role: Role.ENGINEER,
          isActive: false, // Disabled in DB!
          deletedAt: null,
        },
      };

      vi.spyOn(prisma.session, 'findUnique').mockResolvedValue(
        mockDbSession as unknown as Awaited<ReturnType<typeof prisma.session.findUnique>>,
      );

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }),
      );
    });

    it('throws ACCOUNT_INACTIVE when user is soft-deleted in database', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-deleted',
          sessionToken: 'valid-token',
          role: Role.ENGINEER,
          isActive: true,
        },
        expires: new Date().toISOString(),
      });

      const mockDbSession: DbSessionWithUser = {
        id: 'sess-1',
        sessionToken: 'valid-token',
        userId: 'user-deleted',
        expires: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-deleted',
          name: 'Deleted User',
          email: 'deleted@example.com',
          image: null,
          role: Role.ENGINEER,
          isActive: true,
          deletedAt: new Date(), // Soft-deleted in DB!
        },
      };

      vi.spyOn(prisma.session, 'findUnique').mockResolvedValue(
        mockDbSession as unknown as Awaited<ReturnType<typeof prisma.session.findUnique>>,
      );

      await expect(requireAuth()).rejects.toThrow(
        expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }),
      );
    });

    it('returns verified authenticated user when session and user are active and valid', async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: 'user-active',
          sessionToken: 'valid-token-123',
          role: Role.MANAGER,
          isActive: true,
        },
        expires: new Date().toISOString(),
      });

      const mockDbSession: DbSessionWithUser = {
        id: 'sess-1',
        sessionToken: 'valid-token-123',
        userId: 'user-active',
        expires: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-active',
          name: 'Manager User',
          email: 'manager@example.com',
          image: 'https://example.com/avatar.png',
          role: Role.MANAGER,
          isActive: true,
          deletedAt: null,
        },
      };

      vi.spyOn(prisma.session, 'findUnique').mockResolvedValue(
        mockDbSession as unknown as Awaited<ReturnType<typeof prisma.session.findUnique>>,
      );

      const user = await requireAuth();

      expect(user).toEqual({
        id: 'user-active',
        name: 'Manager User',
        email: 'manager@example.com',
        image: 'https://example.com/avatar.png',
        role: Role.MANAGER,
        isActive: true,
        sessionToken: 'valid-token-123',
      });
    });
  });

  describe('AuthError', () => {
    it('sets code and name properly', () => {
      const err = new AuthError('ACCOUNT_INACTIVE');
      expect(err.name).toBe('AuthError');
      expect(err.code).toBe('ACCOUNT_INACTIVE');
      expect(err.message).toBe('ACCOUNT_INACTIVE');
    });
  });
});
