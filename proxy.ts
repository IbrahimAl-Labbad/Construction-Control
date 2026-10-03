/**
 * Next.js Middleware
 *
 * Provides COARSE-GRAINED route protection:
 * - Redirects unauthenticated users to /login
 * - Redirects authenticated users away from /login
 * - Sets `x-pathname` header for server-side layout route awareness
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

import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';
import { sanitizeCorrelationId } from '@/lib/logger/correlation';

export default withAuth(
  function middleware(req) {
    const rawRequestId =
      req.headers.get('x-request-id') ?? req.headers.get('x-correlation-id');
    const correlationId = sanitizeCorrelationId(rawRequestId);

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-pathname', req.nextUrl.pathname);
    requestHeaders.set('x-request-id', correlationId);
    requestHeaders.set('x-correlation-id', correlationId);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set('x-request-id', correlationId);
    return response;
  },
  {
    pages: {
      signIn: '/login',
    },
  }
);

/**
 * Route matcher configuration.
 *
 * Protected route patterns — these routes require authentication.
 * All role-specific routes are protected at the middleware level.
 *
 * Public routes (no authentication required):
 * - /login
 * - /api/auth/*  (NextAuth routes)
 * - /api/health  (Health/readiness checks)
 * - /_next/*     (Next.js internals)
 * - /favicon.ico
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login (public auth page)
     * - /api/auth/* (NextAuth endpoints)
     * - /api/health (Operational health probes)
     * - /_next/static (Next.js static files)
     * - /_next/image (Next.js image optimization)
     * - /favicon.ico
     * - /robots.txt
     * - /sitemap.xml
     */
    '/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
