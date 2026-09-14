/**
 * tests/unit/lib/auth-config.test.ts
 *
 * Unit tests for NextAuth config authorize, jwt, and session callbacks under Option C.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { authOptions, authorizeUser } from '@/lib/auth/config';
import * as passwordModule from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';

describe('lib/auth/config — Option C authorize & callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authorizeUser()', () => {
    it('returns null if email or password are missing', async () => {
      expect(await authorizeUser({})).toBeNull();
      expect(await authorizeUser({ email: 'test@example.com' })).toBeNull();
      expect(await authorizeUser({ password: 'pwd' })).toBeNull();
    });

    it('returns null and records audit log if user does not exist', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof prisma.auditLog.create>>,
      );

      const result = await authorizeUser({
        email: 'unknown@example.com',
        password: 'password123',
      });

      expect(result).toBeNull();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUTH_LOGIN_FAILURE',
            metadata: expect.objectContaining({ reason: 'USER_NOT_FOUND_OR_INACTIVE' }),
          }),
        }),
      );
    });

    it('returns null if user is inactive', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-1',
        name: 'Inactive',
        email: 'inactive@example.com',
        image: null,
        role: Role.ENGINEER,
        isActive: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: null,
      });

      const result = await authorizeUser({
        email: 'inactive@example.com',
        password: 'password123',
      });

      expect(result).toBeNull();
    });

    it('returns null if user is soft-deleted', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-1',
        name: 'Deleted',
        email: 'deleted@example.com',
        image: null,
        role: Role.ENGINEER,
        isActive: true,
        deletedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: null,
      });

      const result = await authorizeUser({
        email: 'deleted@example.com',
        password: 'password123',
      });

      expect(result).toBeNull();
    });

    it('returns null if user has no credentials configured', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-1',
        name: 'No Creds',
        email: 'nocreds@example.com',
        image: null,
        role: Role.ENGINEER,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: null,
      });

      const result = await authorizeUser({
        email: 'nocreds@example.com',
        password: 'password123',
      });

      expect(result).toBeNull();
    });

    it('returns null and logs failure when password verification fails', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-1',
        name: 'User 1',
        email: 'user@example.com',
        image: null,
        role: Role.ENGINEER,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: null,
        credential: {
          id: 'c-1',
          userId: 'u-1',
          passwordHash: '$argon2id$somehash',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(false);
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof prisma.auditLog.create>>,
      );

      const result = await authorizeUser({
        email: 'user@example.com',
        password: 'wrongPassword',
      });

      expect(result).toBeNull();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUTH_LOGIN_FAILURE',
            metadata: expect.objectContaining({ reason: 'INVALID_PASSWORD' }),
          }),
        }),
      );
    });

    it('creates DB session, logs success, and returns authenticated user on valid credentials', async () => {
      const mockUser = {
        id: 'u-valid',
        name: 'Valid User',
        email: 'valid@example.com',
        image: null,
        role: Role.MANAGER,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: null,
        credential: {
          id: 'c-1',
          userId: 'u-valid',
          passwordHash: '$argon2id$correcthash',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
        mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>,
      );
      vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(true);
      const sessionSpy = vi.spyOn(prisma.session, 'create').mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof prisma.session.create>>,
      );
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof prisma.auditLog.create>>,
      );

      const result = await authorizeUser({
        email: 'valid@example.com',
        password: 'correctPassword',
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe('u-valid');
      expect(result?.role).toBe(Role.MANAGER);
      expect(result?.sessionToken).toBeDefined();

      expect(sessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-valid',
            sessionToken: result?.sessionToken,
          }),
        }),
      );

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'u-valid',
            action: 'AUTH_LOGIN_SUCCESS',
          }),
        }),
      );
    });
  });

  describe('callbacks', () => {
    it('jwt callback attaches user id, role, and sessionToken', async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      if (!jwtCallback) throw new Error('jwt callback is missing');

      const initialToken: JWT = {};
      const user = {
        id: 'user-99',
        name: 'Test',
        email: 'test@example.com',
        role: Role.PURCHASING,
        isActive: true,
        sessionToken: 'sess-token-99',
      };

      type JwtFn = (params: { token: JWT; user?: unknown }) => Promise<JWT>;
      const token = await (jwtCallback as JwtFn)({ token: initialToken, user });
      expect(token.id).toBe('user-99');
      expect(token.role).toBe(Role.PURCHASING);
      expect(token.sessionToken).toBe('sess-token-99');
    });

    it('session callback maps token values to session.user', async () => {
      const sessionCallback = authOptions.callbacks?.session;
      if (!sessionCallback) throw new Error('session callback is missing');

      const initialSession: Session = {
        user: { id: '', role: Role.ENGINEER, isActive: true, name: 'Test', email: 'test@example.com' },
        expires: '2026-09-14',
      };
      const token: JWT = {
        id: 'user-77',
        role: Role.ACCOUNTANT,
        sessionToken: 'sess-token-77',
      };

      type SessionFn = (params: { session: Session; token: JWT }) => Promise<Session>;
      const session = await (sessionCallback as SessionFn)({ session: initialSession, token });
      expect(session.user.id).toBe('user-77');
      expect(session.user.role).toBe(Role.ACCOUNTANT);
      expect(session.user.sessionToken).toBe('sess-token-77');
    });
  });

  describe('events.signOut()', () => {
    it('deletes the DB Session row and logs AUTH_LOGOUT when token has sessionToken', async () => {
      const signOutEvent = authOptions.events?.signOut;
      if (!signOutEvent) throw new Error('signOut event is missing');

      const deleteManySpy = vi.spyOn(prisma.session, 'deleteMany').mockResolvedValue({ count: 1 });
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof prisma.auditLog.create>>,
      );

      const token: JWT = { id: 'user-42', sessionToken: 'sess-42', role: 'MANAGER' };
      // NextAuth signOut event passes { token } for JWT strategy
      type SignOutFn = (params: { token: JWT }) => Promise<void>;
      await (signOutEvent as SignOutFn)({ token });

      expect(deleteManySpy).toHaveBeenCalledWith({
        where: { sessionToken: 'sess-42' },
      });
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-42',
            action: 'AUTH_LOGOUT',
          }),
        }),
      );
    });

    it('is a safe no-op when token has no sessionToken', async () => {
      const signOutEvent = authOptions.events?.signOut;
      if (!signOutEvent) throw new Error('signOut event is missing');

      const deleteManySpy = vi.spyOn(prisma.session, 'deleteMany').mockResolvedValue({ count: 0 });

      const token: JWT = { id: 'user-99' }; // no sessionToken
      type SignOutFn = (params: { token: JWT }) => Promise<void>;
      await expect((signOutEvent as SignOutFn)({ token })).resolves.toBeUndefined();
      expect(deleteManySpy).not.toHaveBeenCalled();
    });
  });
});
