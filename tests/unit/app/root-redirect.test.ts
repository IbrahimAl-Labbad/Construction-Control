/**
 * tests/unit/app/root-redirect.test.ts
 *
 * Slice 16 — Root Page Role-Based Redirect Tests.
 *
 * Verifies that HomePage() inspects the authenticated user's role and redirects:
 * - MANAGER    -> /dashboard
 * - ENGINEER   -> /my-projects
 * - ACCOUNTANT -> /payroll
 * - PURCHASING -> /commitments
 * - Unauthenticated / Inactive -> /login
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import HomePage from '@/app/page';
import * as authModule from '@/lib/auth';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

describe('Root Page Role-Based Redirect (Slice 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to /login when requireAuth throws', async () => {
    vi.mocked(authModule.requireAuth).mockRejectedValue(new Error('UNAUTHENTICATED'));

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects MANAGER to /dashboard', async () => {
    vi.mocked(authModule.requireAuth).mockResolvedValue({
      id: 'mgr-1',
      name: 'مدير النظام',
      email: 'manager@test.local',
      role: Role.MANAGER,
      isActive: true,
    });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects ENGINEER to /my-projects', async () => {
    vi.mocked(authModule.requireAuth).mockResolvedValue({
      id: 'eng-1',
      name: 'مهندس الموقع',
      email: 'engineer@test.local',
      role: Role.ENGINEER,
      isActive: true,
    });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/my-projects');
    expect(redirect).toHaveBeenCalledWith('/my-projects');
  });

  it('redirects ACCOUNTANT to /payroll', async () => {
    vi.mocked(authModule.requireAuth).mockResolvedValue({
      id: 'acc-1',
      name: 'المحاسب المالي',
      email: 'accountant@test.local',
      role: Role.ACCOUNTANT,
      isActive: true,
    });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/payroll');
    expect(redirect).toHaveBeenCalledWith('/payroll');
  });

  it('redirects PURCHASING to /commitments', async () => {
    vi.mocked(authModule.requireAuth).mockResolvedValue({
      id: 'pur-1',
      name: 'مسؤول المشتريات',
      email: 'purchasing@test.local',
      role: Role.PURCHASING,
      isActive: true,
    });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/commitments');
    expect(redirect).toHaveBeenCalledWith('/commitments');
  });

  it('redirects unknown or invalid role to /login as a safe fallback', async () => {
    vi.mocked(authModule.requireAuth).mockResolvedValue({
      id: 'unknown-1',
      name: 'مستخدم غير معروف',
      email: 'unknown@test.local',
      role: 'UNKNOWN_ROLE' as Role,
      isActive: true,
    });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
