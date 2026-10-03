import type { Role } from '@prisma/client';
import { requireAuth } from '@/lib/permissions';
import { RoleTopBar } from '@/components/shared/role-top-bar';

export default async function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: Role | null = null;
  try {
    const user = await requireAuth();
    role = user.role;
  } catch {
    // Unauthenticated or inactive session — handled by page guards or middleware
  }

  return (
    <>
      <RoleTopBar role={role} />
      {children}
    </>
  );
}
