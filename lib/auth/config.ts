/**
 * lib/auth/config.ts
 *
 * NextAuth.js configuration.
 *
 * IMPORTANT: This module configures authentication only.
 * Authorization (role checks, permission gates) lives in lib/permissions/.
 *
 * See AGENTS.md §13 for authentication rules.
 */

import { PrismaAdapter } from '@auth/prisma-adapter';
import type { NextAuthOptions, Session, User } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@/lib/db/prisma';

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
export const authOptions: NextAuthOptions = {
  // Use Prisma adapter for database sessions
  // Docs: https://authjs.dev/reference/adapter/prisma
  adapter: PrismaAdapter(prisma) as Adapter,

  // Database sessions (not JWT) — session tokens stored in PostgreSQL
  session: {
    strategy: 'database',
    // 24 hours inactivity timeout
    maxAge: 24 * 60 * 60,
    // Update session on every request (sliding expiry)
    updateAge: 60 * 60, // 1 hour
  },

  // Credentials provider — email + password
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      /**
       * Validate credentials and return the user object.
       * Returns null if credentials are invalid (do NOT throw errors here).
       *
       * Password verification is deferred to the next phase (auth vertical slice).
       * This stub structure ensures the foundation is correct.
       */
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        // Find the user by email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            image: true,
          },
        });

        // User not found or inactive
        if (!user || !user.isActive) {
          return null;
        }

        // TODO (next phase): verify password against Credential.passwordHash
        // const credential = await prisma.credential.findUnique({ where: { userId: user.id } });
        // const isValid = await bcrypt.compare(credentials.password, credential.passwordHash);
        // if (!isValid) return null;

        // Return user for session population
        // IMPORTANT: The password is NOT returned here — never include secrets
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image ?? null,
        };
      },
    }),
  ],

  // Callbacks to enrich session and token with role
  callbacks: {
    /**
     * Adds role and isActive to the session object.
     * Called whenever a session is checked (getServerSession, useSession).
     */
    async session({ session, user }): Promise<Session> {
      if (session.user && user) {
        // Fetch fresh user data including role and active status
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, isActive: true },
        });

        if (!dbUser || !dbUser.isActive) {
          // Force session invalidation for inactive users
          // The session will be invalidated by returning empty user data
          throw new Error('USER_INACTIVE');
        }

        const authenticatedUser: AuthenticatedUser = {
          ...session.user,
          id: dbUser.id,
          role: dbUser.role,
          isActive: dbUser.isActive,
        };

        return {
          ...session,
          user: authenticatedUser,
        };
      }

      return session;
    },
  },

  // Pages — login page lives at /login (implemented in next phase)
  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Debug mode in development
  debug: process.env['NODE_ENV'] === 'development',
};
