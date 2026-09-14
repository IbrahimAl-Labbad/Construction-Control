/**
 * (engineer) route group layout.
 *
 * Enforces Site Engineer role authorization on the server.
 * All pages under /(engineer) are protected by this guard.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { requireRole } from '@/lib/permissions';

export default async function EngineerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization guard
  await requireRole(Role.ENGINEER);

  return <>{children}</>;
}
