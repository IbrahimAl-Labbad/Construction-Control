import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createProgressReportDraft,
  submitProgressReport,
  approveProgressReport,
  rejectProgressReport,
  cancelProgressReport,
} from '@/lib/progress-reports';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Progress Report Concurrency & Atomic State Transitions (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupReportIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير اختبار التزامن',
          email: `mgr.conc.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
      });
    }
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس اختبار التزامن',
          email: `eng.conc.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-CONC-${Date.now()}`,
        name: 'مشروع اختبار التزامن للتقارير',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    testProject = prj;
    cleanupProjectIds.push(prj.id);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const id of cleanupReportIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROGRESS_REPORT', entityId: id } });
      await prisma.progressReport.deleteMany({ where: { id } });
    }
    cleanupReportIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.progressReport.deleteMany({ where: { projectId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;
  });

  it('prevents concurrent duplicate report creation: exactly one succeeds, one fails with DUPLICATE_PROGRESS_REPORT', async () => {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const payload = {
      projectId: testProject.id,
      reportDate: '2025-06-01',
      title: 'تقرير تزامن مكرر',
      workDescription: 'اختبار السباق التزامني عند الإنشاء.',
    };

    const [res1, res2] = await Promise.allSettled([
      createProgressReportDraft(payload),
      createProgressReportDraft(payload),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejections = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const winner = (successes[0] as PromiseFulfilledResult<{ id: string }>).value;
    cleanupReportIds.push(winner.id);

    const loserError = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserError).toBeInstanceOf(AppError);
    expect((loserError as AppError).code).toBe('DUPLICATE_PROGRESS_REPORT');
    expect((loserError as AppError).httpStatus).toBe(409);
  });

  it('enforces cancelled-slot retention (BD-08, BD-14): CANCELLED report blocks new report for same date', async () => {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const payload = {
      projectId: testProject.id,
      reportDate: '2025-06-02',
      title: 'تقرير سيتم إلغاؤه',
      workDescription: 'أعمال موقع سيتم إلغاؤها.',
    };

    // 1. Create and cancel
    const report = await createProgressReportDraft(payload);
    cleanupReportIds.push(report.id);

    const cancelled = await cancelProgressReport(report.id, {
      cancellationReason: 'إلغاء لحجز المفتاح',
    });
    expect(cancelled.status).toBe(ProgressReportStatus.CANCELLED);

    // 2. Attempt to create another report for the exact same (projectId, reportDate, createdById)
    await expect(createProgressReportDraft(payload)).rejects.toThrowError(AppError);

    try {
      await createProgressReportDraft(payload);
    } catch (err) {
      expect((err as AppError).code).toBe('DUPLICATE_PROGRESS_REPORT');
    }
  });

  it('handles concurrent state collision: Manager A approves vs Manager B rejects on SUBMITTED report', async () => {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-06-03',
      title: 'تقرير تصادم الاعتماد والرفض',
      workDescription: 'اختبار تصادم المدراء.',
    });
    cleanupReportIds.push(report.id);

    await submitProgressReport(report.id);

    // Two manager actions simultaneously
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const [resApprove, resReject] = await Promise.allSettled([
      approveProgressReport(report.id),
      rejectProgressReport(report.id, { rejectionReason: 'رفض متزامن' }),
    ]);

    const successes = [resApprove, resReject].filter((r) => r.status === 'fulfilled');
    const rejections = [resApprove, resReject].filter((r) => r.status === 'rejected');

    // Exactly one operation wins via atomic updateMany compare-and-set
    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const loserReason = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserReason).toBeInstanceOf(AppError);
    expect((loserReason as AppError).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('handles concurrent submit vs cancel on DRAFT report', async () => {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-06-04',
      title: 'تقرير تصادم التقديم والإلغاء',
      workDescription: 'اختبار تصادم التقديم والإلغاء.',
    });
    cleanupReportIds.push(report.id);

    const [resSubmit, resCancel] = await Promise.allSettled([
      submitProgressReport(report.id),
      cancelProgressReport(report.id, { cancellationReason: 'إلغاء متزامن' }),
    ]);

    const successes = [resSubmit, resCancel].filter((r) => r.status === 'fulfilled');
    const rejections = [resSubmit, resCancel].filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const loserReason = (rejections[0] as PromiseRejectedResult).reason;
    expect(loserReason).toBeInstanceOf(AppError);
    expect((loserReason as AppError).code).toBe('INVALID_STATE_TRANSITION');
  });
});
