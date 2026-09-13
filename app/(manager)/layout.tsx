/**
 * (manager) route group layout — structural placeholder.
 *
 * Wrap all Manager-only pages. Will include:
 * - Sidebar navigation (manager menu)
 * - Header with role badge
 * - Authorization guard: requireRole(Role.MANAGER)
 *
 * Implemented in the next phase (Authentication + Role-based routing).
 * DO NOT add business content here yet.
 */
export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
