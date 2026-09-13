/**
 * Next.js Middleware
 *
 * Provides COARSE-GRAINED route protection:
 * - Redirects unauthenticated users to /login
 * - Redirects authenticated users away from /login
 *
 * IMPORTANT: Middleware provides only URL-level protection.
 * FINE-GRAINED authorization (role checks) must ALSO be enforced
 * in Server Components, Server Actions, and API routes via
 * lib/permissions/guards.ts.
 *
 * Never rely on middleware alone for security.
 *
 * See AGENTS.md §14 for authorization rules.
 */

import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

/**
 * Route matcher configuration.
 *
 * Protected route patterns — these routes require authentication.
 * All role-specific routes are protected at the middleware level.
 *
 * Public routes (no authentication required):
 * - /login
 * - /api/auth/*  (NextAuth routes)
 * - /_next/*     (Next.js internals)
 * - /favicon.ico
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login (public auth page)
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/static (Next.js static files)
     * - /_next/image (Next.js image optimization)
     * - /favicon.ico
     * - /robots.txt
     * - /sitemap.xml
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
