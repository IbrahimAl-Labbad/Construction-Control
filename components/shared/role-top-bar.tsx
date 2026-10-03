'use client';

/**
 * components/shared/role-top-bar.tsx
 *
 * Universal role-aware top bar component for shared operational routes
 * (/payroll, /subcontractor-billings, /commitments, /expenses, /custodies).
 *
 * Dynamically renders the appropriate top navigation bar based on the
 * authenticated user's role:
 * - MANAGER    -> ManagerTopBar
 * - ENGINEER   -> EngineerTopBar
 * - ACCOUNTANT -> AccountantTopBar
 * - PURCHASING -> PurchasingTopBar
 *
 * Fixes dead-end navigation on shared pages (AGENTS.md §19 & Slice 18 UX Audit).
 */

import { Role } from '@prisma/client';
import { ManagerTopBar } from './manager-top-bar';
import { EngineerTopBar } from './engineer-top-bar';
import { AccountantTopBar } from './accountant-top-bar';
import { PurchasingTopBar } from './purchasing-top-bar';

export interface RoleTopBarProps {
  role?: Role | null;
}

export function RoleTopBar({ role }: RoleTopBarProps) {
  if (!role) {
    return null;
  }

  return (
    <div data-testid="role-top-bar">
      {role === Role.MANAGER && <ManagerTopBar />}
      {role === Role.ENGINEER && <EngineerTopBar />}
      {role === Role.ACCOUNTANT && <AccountantTopBar />}
      {role === Role.PURCHASING && <PurchasingTopBar />}
    </div>
  );
}
