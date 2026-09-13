/**
 * (accountant) route group layout — structural placeholder.
 *
 * Wrap all Accountant-only pages. Will include:
 * - Sidebar navigation (accountant menu)
 * - Authorization guard: requireRole(Role.ACCOUNTANT)
 *
 * Implemented in the next phase (Authentication + Role-based routing).
 * DO NOT add business content here yet.
 */
export default function AccountantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
