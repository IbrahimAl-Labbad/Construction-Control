/**
 * app/(manager)/users/user-status-badge.tsx
 *
 * Presentational badge component for user active/inactive status.
 * Server-component safe — no client-side state or effects.
 *
 * See AGENTS.md §15 for RTL/Arabic UI rules.
 */

interface UserStatusBadgeProps {
  isActive: boolean;
}

/**
 * Renders a colored Arabic status badge.
 * - Active (نشط): green
 * - Inactive (غير نشط): red
 */
export function UserStatusBadge({ isActive }: UserStatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        isActive
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      ].join(' ')}
      aria-label={isActive ? 'الحساب نشط' : 'الحساب غير نشط'}
    >
      {isActive ? 'نشط' : 'غير نشط'}
    </span>
  );
}
