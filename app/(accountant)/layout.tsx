/**
 * (accountant) route group layout.
 *
 * Enforces Accountant role authorization on the server.
 * All pages under /(accountant) are protected by this guard.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { requireRole } from '@/lib/permissions';

export default async function AccountantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization guard
  await requireRole(Role.ACCOUNTANT);

  return <>{children}</>;
}
