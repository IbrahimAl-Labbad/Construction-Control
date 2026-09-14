/**
 * (purchasing) route group layout.
 *
 * Enforces Purchasing Officer role authorization on the server.
 * All pages under /(purchasing) are protected by this guard.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { Role } from '@prisma/client';
import { requireRole } from '@/lib/permissions';

export default async function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization guard
  await requireRole(Role.PURCHASING);

  return <>{children}</>;
}
