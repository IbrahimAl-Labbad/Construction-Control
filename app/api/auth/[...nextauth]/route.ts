/**
 * NextAuth route handler.
 *
 * This is the single API route required for NextAuth.js to function.
 * It handles all auth-related requests:
 * - GET/POST /api/auth/signin
 * - GET/POST /api/auth/signout
 * - GET/POST /api/auth/callback/*
 * - GET /api/auth/session
 * - GET /api/auth/csrf
 * - GET /api/auth/providers
 *
 * The configuration lives in lib/auth/config.ts.
 * Do NOT add business logic here.
 */

import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth/config';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
