'use client';

/**
 * app/(manager)/users/user-list-table.tsx
 *
 * Interactive user list table — Client Component.
 *
 * Displays the list of users with deactivate/reactivate toggle actions.
 * Receives initial data from the server component (UsersPage) as props.
 * Calls server actions for mutations and applies optimistic UI updates.
 *
 * Security:
 * - Mutation requests go through server actions, which enforce server-side auth.
 * - Client state is display-only; the server is the source of truth.
 *
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */

import * as React from 'react';
import { ROLE_METADATA } from '@/lib/permissions/roles';
import { Button } from '@/components/ui/button';
import { deactivateUserAction, reactivateUserAction } from './actions';
import { UserStatusBadge } from './user-status-badge';

import type { UserSummary } from '@/lib/user-management';

interface UserListTableProps {
  initialUsers: UserSummary[];
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Date formatter (Arabic locale, timezone-aware)
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays a list of users with status toggle controls.
 * Optimistically updates local state after server action resolves.
 */
export function UserListTable({ initialUsers, currentUserId }: UserListTableProps) {
  const [users, setUsers] = React.useState<UserSummary[]>(initialUsers);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Sync with server-side re-fetch when initialUsers changes
  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  async function handleToggleStatus(user: UserSummary) {
    setErrorMessage(null);
    setPendingId(user.id);

    try {
      const result = user.isActive
        ? await deactivateUserAction(user.id)
        : await reactivateUserAction(user.id);

      if (result.success) {
        // Optimistic update — apply server-returned state
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? result.data : u)),
        );
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
    } finally {
      setPendingId(null);
    }
  }

  // Empty state
  if (users.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border p-12 text-center"
        data-testid="user-list-empty"
        role="status"
        aria-label="لا يوجد مستخدمون"
      >
        <p className="text-muted-foreground">لم يتم إنشاء أي مستخدمين بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Error alert */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      {/* Table wrapper — horizontally scrollable on small screens */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full text-sm"
          aria-label="جدول المستخدمين"
          data-testid="user-list-table"
        >
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                الاسم
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                البريد الإلكتروني
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                الدور
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                الحالة
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                تاريخ الإنشاء
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start font-medium text-muted-foreground"
              >
                الإجراء
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const roleMeta = ROLE_METADATA[user.role];
              const isThisRowPending = pendingId === user.id;
              const isSelf = currentUserId !== undefined && user.id === currentUserId;

              return (
                <tr
                  key={user.id}
                  className="bg-card transition-colors hover:bg-muted/30"
                  data-testid={`user-row-${user.id}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {roleMeta.labelAr}
                  </td>
                  <td className="px-4 py-3">
                    <UserStatusBadge isActive={user.isActive} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      id={`toggle-status-${user.id}`}
                      variant={user.isActive ? 'destructive' : 'outline'}
                      size="sm"
                      disabled={isThisRowPending || isSelf}
                      title={isSelf ? 'لا يمكنك تعطيل حسابك الخاص' : undefined}
                      onClick={() => handleToggleStatus(user)}
                      aria-label={
                        isSelf
                          ? `لا يمكنك تعطيل حسابك الخاص (${user.name})`
                          : user.isActive
                            ? `تعطيل حساب ${user.name}`
                            : `تفعيل حساب ${user.name}`
                      }
                      data-testid={
                        user.isActive
                          ? `deactivate-user-${user.id}`
                          : `activate-user-${user.id}`
                      }
                    >
                      {isThisRowPending
                        ? 'جارٍ التحديث...'
                        : user.isActive
                          ? 'تعطيل'
                          : 'تفعيل'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {users.length} مستخدم
      </p>
    </div>
  );
}
