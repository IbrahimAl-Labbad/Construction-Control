import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, ProgressReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createProgressReportDraft,
  updateProgressReportDraft,
  submitProgressReport,
  approveProgressReport,
  rejectProgressReport,
  reopenProgressReport,
  cancelProgressReport,
  getEngineerProgressReports,
  getProjectProgressReports,
  getAllProgressReports,
} from '@/lib/progress-reports';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Progress Report Lifecycle Integration Tests (Live PostgreSQL)', () => {
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
          name: 'مدير اختبار التقارير',
          email: `mgr.prog.${Date.now()}@test.local`,
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
          name: 'مهندس اختبار التقارير',
          email: `eng.prog.${Date.now()}@test.local`,
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

    // 3. Active Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-PROG-${Date.now()}`,
        name: 'مشروع اختبار تقارير التقدم',
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

  it('runs complete happy path: DRAFT -> EDIT -> SUBMIT -> APPROVE (Immutable)', async () => {
    // 1. Engineer creates DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const draft = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-01',
      title: 'تقرير الأعمال الميدانية الأولي',
      workDescription: 'بدء أعمال الحفر والتجهيز للموقع.',
      progressPercentage: 10,
      blockers: null,
      nextPeriodPlan: 'استكمال أعمال الحفر وتجهيز الأساسات.',
      weatherCondition: 'صحو',
    });
    cleanupReportIds.push(draft.id);

    expect(draft.status).toBe(ProgressReportStatus.DRAFT);
    expect(draft.reportDate).toBe('2025-03-01');
    expect(draft.progressPercentage).toBe(10);
    expect(draft.createdById).toBe(testEngineer.id);
    expect(draft.submittedAt).toBeNull();
    expect(draft.approvedAt).toBeNull();

    // 2. Engineer updates DRAFT
    const updated = await updateProgressReportDraft(draft.id, {
      title: 'تقرير الأعمال الميدانية المحدث',
      progressPercentage: 15,
      workDescription: 'تم الانتهاء من الحفر بنسبة 15%.',
    });
    expect(updated.title).toBe('تقرير الأعمال الميدانية المحدث');
    expect(updated.progressPercentage).toBe(15);

    // 3. Engineer submits report
    const submitted = await submitProgressReport(draft.id);
    expect(submitted.status).toBe(ProgressReportStatus.SUBMITTED);
    expect(submitted.submittedAt).not.toBeNull();

    // Cannot edit when SUBMITTED
    await expect(
      updateProgressReportDraft(draft.id, { title: 'تعديل غير مسموح' }),
    ).rejects.toThrowError(AppError);

    // 4. Manager approves report
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const approved = await approveProgressReport(draft.id);
    expect(approved.status).toBe(ProgressReportStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).not.toBeNull();

    // 5. APPROVED report is strictly immutable
    await expect(
      approveProgressReport(draft.id),
    ).rejects.toThrowError(AppError);

    await expect(
      rejectProgressReport(draft.id, { rejectionReason: 'محاولة رفض معتمد' }),
    ).rejects.toThrowError(AppError);
  });

  it('runs rejection and reopen flow: SUBMIT -> REJECT -> REOPEN -> RESUBMIT -> APPROVE', async () => {
    // 1. Create and submit as Engineer
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-05',
      title: 'تقرير الأعمال الإنشائية',
      workDescription: 'صب خرسانة القواعد المسلحة.',
    });
    cleanupReportIds.push(report.id);

    await submitProgressReport(report.id);

    // 2. Manager rejects report with reason
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const rejected = await rejectProgressReport(report.id, {
      rejectionReason: 'يرجى توضيح نتائج فحص هبوط الخرسانة (Slump Test)',
    });
    expect(rejected.status).toBe(ProgressReportStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id);
    expect(rejected.rejectedAt).not.toBeNull();
    expect(rejected.rejectionReason).toContain('Slump Test');

    // 3. Engineer reopens report to DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const reopened = await reopenProgressReport(report.id);
    expect(reopened.status).toBe(ProgressReportStatus.DRAFT);
    // Rejection fields cleared
    expect(reopened.rejectedById).toBeNull();
    expect(reopened.rejectedAt).toBeNull();
    expect(reopened.rejectionReason).toBeNull();

    // 4. Engineer edits and resubmits
    await updateProgressReportDraft(report.id, {
      workDescription: 'صب خرسانة القواعد مع تسجيل نتائج اختبار الهبوط (100mm مطابق للمواصفات).',
    });
    const resubmitted = await submitProgressReport(report.id);
    expect(resubmitted.status).toBe(ProgressReportStatus.SUBMITTED);

    // 5. Manager approves
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const finalApproved = await approveProgressReport(report.id);
    expect(finalApproved.status).toBe(ProgressReportStatus.APPROVED);
  });

  it('runs cancellation flows by Engineer (DRAFT) and Manager (SUBMITTED)', async () => {
    // 1. Engineer cancels own DRAFT
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const report1 = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-10',
      title: 'مسودة تم إلغاؤها من المهندس',
      workDescription: 'تقرير بالخطأ.',
    });
    cleanupReportIds.push(report1.id);

    const cancelledByEng = await cancelProgressReport(report1.id, {
      cancellationReason: 'تم إنشاؤه بالخطأ',
    });
    expect(cancelledByEng.status).toBe(ProgressReportStatus.CANCELLED);
    expect(cancelledByEng.cancelledById).toBe(testEngineer.id);
    expect(cancelledByEng.cancellationReason).toBe('تم إنشاؤه بالخطأ');

    // 2. Manager cancels SUBMITTED report
    const report2 = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-11',
      title: 'تقرير تم إلغاؤه من المدير',
      workDescription: 'أعمال قيد المراجعة.',
    });
    cleanupReportIds.push(report2.id);

    await submitProgressReport(report2.id);

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const cancelledByMgr = await cancelProgressReport(report2.id, {
      cancellationReason: 'إلغاء بأمر الإدارة',
    });
    expect(cancelledByMgr.status).toBe(ProgressReportStatus.CANCELLED);
    expect(cancelledByMgr.cancelledById).toBe(testManager.id);
  });

  it('executes list queries with filters and ordering', async () => {
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer);

    const r1 = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-01',
      title: 'تقرير قديم',
      workDescription: 'أعمال سابقة.',
    });
    cleanupReportIds.push(r1.id);

    const r2 = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-03-02',
      title: 'تقرير أحدث',
      workDescription: 'أعمال تالية.',
    });
    cleanupReportIds.push(r2.id);

    // Engineer list: ordered by reportDate DESC
    const engList = await getEngineerProgressReports();
    expect(engList.length).toBeGreaterThanOrEqual(2);
    expect(engList[0]!.reportDate >= engList[1]!.reportDate).toBe(true);

    // Manager queries
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const prjList = await getProjectProgressReports(testProject.id);
    expect(prjList.length).toBe(2);

    const globalList = await getAllProgressReports({ projectId: testProject.id });
    expect(globalList.length).toBe(2);
  });
});
