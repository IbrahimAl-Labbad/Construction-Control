/**
 * tests/unit/app/progress-reports-guard.test.ts
 *
 * Slice 16 — Progress Reports Page Guard Unit Test.
 *
 * Verifies that ManagerProgressReportsPage explicitly invokes requireManager()
 * at the page level before executing any project queries.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import ManagerProgressReportsPage from '@/app/(manager)/progress-reports/page';
import * as permissions from '@/lib/permissions';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth';

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof permissions>();
  return {
    ...actual,
    requireManager: vi.fn(),
  };
});

vi.mock('@/lib/progress-reports', () => ({
  getAllProgressReports: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('ManagerProgressReportsPage Page-Level Guard (Slice 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects execution if requireManager throws', async () => {
    vi.mocked(permissions.requireManager).mockRejectedValue(new Error('FORBIDDEN'));

    await expect(
      ManagerProgressReportsPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('FORBIDDEN');

    expect(permissions.requireManager).toHaveBeenCalledTimes(1);
  });

  it('proceeds when requireManager succeeds', async () => {
    vi.mocked(permissions.requireManager).mockResolvedValue({
      id: 'mgr-1',
      name: 'مدير النظام',
      email: 'mgr@test.local',
      role: Role.MANAGER,
      isActive: true,
    } as unknown as AuthenticatedUser);

    const pageResult = await ManagerProgressReportsPage({
      searchParams: Promise.resolve({}),
    });

    expect(permissions.requireManager).toHaveBeenCalledTimes(1);
    expect(pageResult).toBeDefined();
  });
});

describe('ManagerReportDetailPage & Actions Guards (Slice 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects action execution when requireManager throws PermissionError', async () => {
    const { approveProgressReportAction, rejectProgressReportAction, cancelProgressReportAction } =
      await import('@/app/(manager)/progress-reports/actions');

    vi.mocked(permissions.requireManager).mockRejectedValue(
      new permissions.PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    const approveRes = await approveProgressReportAction('rep-1');
    expect(approveRes.success).toBe(false);
    expect(approveRes.error).toBeDefined();

    const rejectRes = await rejectProgressReportAction('rep-1', 'سبب الرفض');
    expect(rejectRes.success).toBe(false);
    expect(rejectRes.error).toBeDefined();

    const cancelRes = await cancelProgressReportAction('rep-1', 'سبب الإلغاء');
    expect(cancelRes.success).toBe(false);
    expect(cancelRes.error).toBeDefined();
  });

  it('rejects ManagerReportDetailPage if requireManager throws', async () => {
    const ManagerReportDetailPage = (await import('@/app/(manager)/progress-reports/[id]/page')).default;

    vi.mocked(permissions.requireManager).mockRejectedValue(new Error('FORBIDDEN_MANAGER'));

    await expect(
      ManagerReportDetailPage({
        params: Promise.resolve({ id: 'rep-1' }),
      }),
    ).rejects.toThrow('FORBIDDEN_MANAGER');

    expect(permissions.requireManager).toHaveBeenCalled();
  });
});
