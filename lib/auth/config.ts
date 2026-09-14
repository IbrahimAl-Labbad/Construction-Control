/**
 * lib/auth/config.ts
 *
 * NextAuth.js configuration implementing Option C:
 * Hybrid JWT sessions with real-time PostgreSQL database session synchronization.
 *
 * Requirements (from AGENTS.md §17 & Owner Decision):
 * - Provider: CredentialsProvider (email + password)
 * - Session strategy: "jwt" (required by NextAuth v4 for CredentialsProvider)
 * - Source of truth: PostgreSQL Session table is synchronized on sign-in
 * - Password verification: Argon2id via verifyPassword()
 * - Real-time enforcement: Protected requests verify DB session existence and active status
 *
 * See AGENTS.md §17 for authentication rules.
 */

import crypto from 'crypto';
import type { NextAuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@/lib/db/prisma';
import type { Role } from '@/lib/permissions/roles';

import { verifyPassword } from './password';
import type { AuthenticatedUser } from './types';

// ---------------------------------------------------------------------------
// Auth options
// ---------------------------------------------------------------------------

/**
 * NextAuth configuration.
 *
 * Exported for use in:
 * - app/api/auth/[...nextauth]/route.ts (route handler)
 * - lib/auth/session.ts (getServerSession)
 */
/**
 * Authorize credentials and verify with Argon2id.
 * Synchronizes database Session record on successful authentication.
 */
export async function authorizeUser(
  credentials?: Record<string, string | undefined>,
): Promise<AuthenticatedUser | null> {
  if (!credentials?.email || !credentials.password) {
    return null;
  }

  const normalizedEmail = credentials.email.trim().toLowerCase();

  // 1. Look up user with stored credential
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { credential: true },
  });

  // 2. Reject if user not found, soft-deleted, or inactive
  if (!user || !user.isActive || user.deletedAt !== null) {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'USER',
          metadata: { email: normalizedEmail, reason: 'USER_NOT_FOUND_OR_INACTIVE' },
        },
      });
    } catch {
      // Ignore audit failure in auth path
    }
    return null;
  }

  // 3. User has no password credentials set
  if (!user.credential) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'USER',
          entityId: user.id,
          metadata: { email: normalizedEmail, reason: 'NO_CREDENTIAL_FOUND' },
        },
      });
    } catch {
      // Ignore
    }
    return null;
  }

  // 4. Verify password with Argon2id
  const isPasswordValid = await verifyPassword(
    user.credential.passwordHash,
    credentials.password,
  );

  if (!isPasswordValid) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'USER',
          entityId: user.id,
          metadata: { email: normalizedEmail, reason: 'INVALID_PASSWORD' },
        },
      });
    } catch {
      // Ignore
    }
    return null;
  }

  // 5. Option C: Create associated database Session record in PostgreSQL
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'USER',
        entityId: user.id,
      },
    });
  } catch {
    // If DB write fails, auth cannot proceed safely
    return null;
  }

  // 6. Return minimal authenticated user object (never include passwordHash)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role,
    isActive: user.isActive,
    sessionToken,
  };
}

export const authOptions: NextAuthOptions = {
  // Option C: JWT session strategy for NextAuth credentials compatibility
  session: {
    strategy: 'jwt',
    // 24 hours session lifetime
    maxAge: 24 * 60 * 60,
    // Sliding expiry: update age 1 hour
    updateAge: 60 * 60,
  },

  // Credentials provider — email + password with Argon2id verification
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeUser,
    }),
  ],

  // Callbacks to enrich JWT and Session tokens with role and DB sessionToken
  callbacks: {
    /**
     * Enriches the JWT with the user's role and database sessionToken on initial sign-in.
     */
    async jwt({ token, user }): Promise<JWT> {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        if (user.sessionToken !== undefined) {
          token.sessionToken = user.sessionToken;
        }
      }
      return token;
    },

    /**
     * Propagates role, id, and sessionToken to session.user.
     */
    async session({ session, token }): Promise<Session> {
      if (token && session.user) {
        const authenticatedUser: AuthenticatedUser = {
          id: (token.id as string) ?? session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          role: (token.role as Role) ?? 'ENGINEER',
          isActive: true,
          sessionToken: token.sessionToken,
        };

        session.user = authenticatedUser;
      }

      return session;
    },
  },

  // Events — Option C lifecycle hooks
  events: {
    /**
     * Option C: Revoke database Session record when user signs out.
     */
    async signOut({ token }): Promise<void> {
      if (token?.sessionToken) {
        try {
          await prisma.session.deleteMany({
            where: { sessionToken: token.sessionToken },
          });

          if (token.id) {
            await prisma.auditLog.create({
              data: {
                actorId: token.id as string,
                action: 'AUTH_LOGOUT',
                entityType: 'USER',
                entityId: token.id as string,
              },
            });
          }
        } catch {
          // Failure to delete session or audit on signout should not throw unhandled rejection
        }
      }
    },
  },

  // Pages — custom login page
  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Debug mode in development
  debug: process.env['NODE_ENV'] === 'development',
};
