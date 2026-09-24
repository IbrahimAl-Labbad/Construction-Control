import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createProgressReportDraft,
  updateProgressReportDraft,
  submitProgressReport,
  approveProgressReport,
  rejectProgressReport,
  reopenProgressReport,
  cancelProgressReport,
} from '@/lib/progress-reports';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Progress Report Audit Atomicity Integration Tests (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupReportIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير تدقيق التقارير',
          email: `mgr.audit.${Date.now()}@test.local`,
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

    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس تدقيق التقارير',
          email: `eng.audit.${Date.now()}@test.local`,
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

    const prj = await prisma.project.create({
      data: {
        code: `PRJ-AUDIT-${Date.now()}`,
        name: 'مشروع تدقيق تقارير التقدم',
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

  it('records audit log entries for all 7 lifecycle actions with exact actor and entityId', async () => {
    // 1. CREATED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-07-01',
      title: 'تقرير التدقيق الأولي',
      workDescription: 'أعمال تجهيز الموقع.',
    });
    cleanupReportIds.push(report.id);

    const createLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_CREATED' },
    });
    expect(createLog).not.toBeNull();
    expect(createLog?.actorId).toBe(testEngineer.id);

    // 2. UPDATED
    await updateProgressReportDraft(report.id, { title: 'تقرير التدقيق المعدل' });
    const updateLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_UPDATED' },
    });
    expect(updateLog).not.toBeNull();
    expect(updateLog?.actorId).toBe(testEngineer.id);

    // 3. SUBMITTED
    await submitProgressReport(report.id);
    const submitLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_SUBMITTED' },
    });
    expect(submitLog).not.toBeNull();
    expect(submitLog?.actorId).toBe(testEngineer.id);

    // 4. REJECTED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    await rejectProgressReport(report.id, { rejectionReason: 'مطلوب مراجعة' });
    const rejectLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_REJECTED' },
    });
    expect(rejectLog).not.toBeNull();
    expect(rejectLog?.actorId).toBe(testManager.id);

    // 5. REOPENED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    await reopenProgressReport(report.id);
    const reopenLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_REOPENED' },
    });
    expect(reopenLog).not.toBeNull();
    expect(reopenLog?.actorId).toBe(testEngineer.id);

    // Resubmit and approve
    await submitProgressReport(report.id);

    // 6. APPROVED
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    await approveProgressReport(report.id);
    const approveLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: report.id, action: 'PROGRESS_REPORT_APPROVED' },
    });
    expect(approveLog).not.toBeNull();
    expect(approveLog?.actorId).toBe(testManager.id);

    // 7. CANCELLED (on a new report)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const reportToCancel = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-07-02',
      title: 'تقرير للإلغاء والتدقيق',
      workDescription: 'سيتم إلغاؤه.',
    });
    cleanupReportIds.push(reportToCancel.id);

    await cancelProgressReport(reportToCancel.id, { cancellationReason: 'سبب الإلغاء' });
    const cancelLog = await prisma.auditLog.findFirst({
      where: { entityType: 'PROGRESS_REPORT', entityId: reportToCancel.id, action: 'PROGRESS_REPORT_CANCELLED' },
    });
    expect(cancelLog).not.toBeNull();
    expect(cancelLog?.actorId).toBe(testEngineer.id);
  });
});
