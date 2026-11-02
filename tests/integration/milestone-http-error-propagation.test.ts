/**
 * tests/integration/milestone-http-error-propagation.test.ts
 *
 * Verifies HTTP Error Propagation for Milestone Evidence Errors (CR-08 / BD-17 / §7.2.5).
 *
 * Confirms that when completeMilestone fails due to missing visual evidence:
 * 1. An AppError('MILESTONE_EVIDENCE_MISSING') is thrown.
 * 2. It maps to HTTP 400 (Bad Request).
 * 3. formatErrorResponse produces a structured payload with machine-readable code 'MILESTONE_EVIDENCE_MISSING'.
 */

import { describe, expect, it, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createMilestone, completeMilestone } from '@/lib/milestones';
import * as permissions from '@/lib/permissions';
import { AppError, formatErrorResponse, ERROR_HTTP_STATUS } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone HTTP Error Propagation (Live DB)', () => {
  let managerUser: AuthenticatedUser;
  let testProject: { id: string };

  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير أخطاء HTTP',
        email: `mgr.http.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    managerUser = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    const prj = await prisma.project.create({
      data: {
        code: `PRJ-HTP-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار أخطاء HTTP',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = { id: prj.id };

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(managerUser);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(managerUser);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (cleanupProjectIds.length > 0) {
      await prisma.progressReportMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.projectMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: cleanupProjectIds } },
      });
    }

    if (cleanupUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: cleanupUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
  });

  it('propagates MILESTONE_EVIDENCE_MISSING as HTTP 400 with formatted error response', async () => {
    const milestone = await createMilestone({
      projectId: testProject.id,
      title: 'محطة بدون أدلة',
      targetDate: '2026-11-20',
    });

    let caughtError: AppError | null = null;
    try {
      await completeMilestone(milestone.id);
    } catch (err) {
      caughtError = err as AppError;
    }

    expect(caughtError).toBeInstanceOf(AppError);
    expect(caughtError?.code).toBe('MILESTONE_EVIDENCE_MISSING');
    expect(caughtError?.httpStatus).toBe(400);
    expect(ERROR_HTTP_STATUS['MILESTONE_EVIDENCE_MISSING']).toBe(400);

    const clientResponse = formatErrorResponse(caughtError!);
    expect(clientResponse).toEqual({
      error: 'MILESTONE_EVIDENCE_MISSING',
      message: 'لا يمكن اعتماد إنجاز المحطة بدون تقرير تقدم معتمد يحتوي على أدلة بصرية مؤهلة (صور)',
    });
  });
});
