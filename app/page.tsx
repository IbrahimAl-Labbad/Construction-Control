import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth';

/**
 * Root page — server-side role-based redirect.
 *
 * Directs authenticated users to their primary role workspace:
 * - MANAGER    -> /dashboard
 * - ENGINEER   -> /my-projects
 * - ACCOUNTANT -> /payroll
 * - PURCHASING -> /commitments
 *
 * Unauthenticated, inactive, or unverified sessions are redirected to /login.
 *
 * See AGENTS.md §5 and §18.
 */
export default async function HomePage() {
  let user: AuthenticatedUser | null = null;

  try {
    user = await requireAuth();
  } catch {
    user = null;
  }

  if (!user) {
    redirect('/login');
  }

  switch (user.role) {
    case Role.MANAGER:
      redirect('/dashboard');
      break;
    case Role.ENGINEER:
      redirect('/my-projects');
      break;
    case Role.ACCOUNTANT:
      redirect('/payroll');
      break;
    case Role.PURCHASING:
      redirect('/commitments');
      break;
    default:
      redirect('/login');
      break;
  }
}

