/**
 * (purchasing) route group layout — structural placeholder.
 *
 * Wrap all Purchasing Officer pages. Will include:
 * - Sidebar navigation (purchasing menu)
 * - Authorization guard: requireRole(Role.PURCHASING)
 *
 * Implemented in the next phase (Authentication + Role-based routing).
 * DO NOT add business content here yet.
 */
export default function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
