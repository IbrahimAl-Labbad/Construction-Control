/**
 * (auth) route group layout.
 *
 * Wraps authentication pages (/login, /logout, etc.)
 *
 * This layout is intentionally minimal — no navigation, no sidebar.
 * Authentication pages should be distraction-free.
 *
 * Business pages are in the role-specific route groups:
 * - (manager)/
 * - (engineer)/
 * - (accountant)/
 * - (purchasing)/
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      {children}
    </div>
  );
}
