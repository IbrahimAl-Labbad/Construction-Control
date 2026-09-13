/**
 * (engineer) route group layout — structural placeholder.
 *
 * Wrap all Engineer-only pages. Will include:
 * - Sidebar navigation (engineer menu)
 * - Authorization guard: requireRole(Role.ENGINEER)
 *
 * Implemented in the next phase (Authentication + Role-based routing).
 * DO NOT add business content here yet.
 */
export default function EngineerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
