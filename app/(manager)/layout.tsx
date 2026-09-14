/**
 * (manager) route group layout.
 *
 * Enforces Manager-only role authorization on the server.
 * All pages under /(manager) are protected by this guard.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { requireRole } from '@/lib/permissions';

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization guard
  await requireRole(Role.MANAGER);

  return <>{children}</>;
}
