import type { Metadata } from 'next';
import * as React from 'react';
import { Users } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { listUsers } from '@/lib/user-management';
import { CreateUserForm } from './create-user-form';
import { UserListTable } from './user-list-table';

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'إدارة المستخدمين',
  description: 'إنشاء المستخدمين وتعطيلهم وإعادة تفعيلهم — مخصص للمدير فقط',
};

/**
 * User management page — Server Component.
 *
 * Authorization is enforced at two layers:
 * 1. The (manager) layout guard calls requireRole(MANAGER) before rendering.
 * 2. The listUsers use case calls requireManager() again (defense-in-depth).
 *
 * Data is fetched server-side and passed as props to client components.
 * No client-side data fetching for the initial render.
 *
 * See AGENTS.md §18 for authorization rules.
 */
export default async function UsersPage() {
  const [manager, users] = await Promise.all([
    requireManager(),
    listUsers(),
  ]);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء حسابات المستخدمين وإدارة صلاحياتهم
          </p>
        </div>
      </div>

      {/* Create user form */}
      <section aria-labelledby="create-user-heading">
        <h2
          id="create-user-heading"
          className="mb-4 text-lg font-semibold text-foreground"
        >
          إنشاء مستخدم جديد
        </h2>
        <React.Suspense fallback={null}>
          <CreateUserForm />
        </React.Suspense>
      </section>

      {/* User list */}
      <section aria-labelledby="user-list-heading">
        <h2
          id="user-list-heading"
          className="mb-4 text-lg font-semibold text-foreground"
        >
          قائمة المستخدمين
        </h2>
        <UserListTable initialUsers={users} currentUserId={manager.id} />
      </section>
    </div>
  );
}
