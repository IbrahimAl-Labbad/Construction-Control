import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createProgressReportDraft,
  updateProgressReportDraft,
  submitProgressReport,
  cancelProgressReport,
  getProgressReport,
  getActiveProjectsForEngineer,
} from '@/lib/progress-reports';
import * as permissions from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Progress Report Authorization & IDOR Integration Tests (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer1: AuthenticatedUser;
  let testEngineer2: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupReportIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // Manager
    let mgr = await prisma.user.findFirst({ where: { role: Role.MANAGER, isActive: true, deletedAt: null } });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: { name: 'مدير الصلاحيات', email: `mgr.auth.${Date.now()}@test.local`, role: Role.MANAGER, isActive: true },
      });
    }
    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };

    // Engineer 1
    let eng1 = await prisma.user.findFirst({ where: { role: Role.ENGINEER, isActive: true, deletedAt: null } });
    if (!eng1) {
      eng1 = await prisma.user.create({
        data: { name: 'مهندس 1', email: `eng1.auth.${Date.now()}@test.local`, role: Role.ENGINEER, isActive: true },
      });
    }
    testEngineer1 = { id: eng1.id, name: eng1.name, email: eng1.email, role: Role.ENGINEER, isActive: true };

    // Engineer 2
    const eng2 = await prisma.user.create({
      data: { name: 'مهندس 2', email: `eng2.auth.${Date.now()}@test.local`, role: Role.ENGINEER, isActive: true },
    });
    testEngineer2 = { id: eng2.id, name: eng2.name, email: eng2.email, role: Role.ENGINEER, isActive: true };

    // Accountant
    let acc = await prisma.user.findFirst({ where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null } });
    if (!acc) {
      acc = await prisma.user.create({
        data: { name: 'محاسب', email: `acc.auth.${Date.now()}@test.local`, role: Role.ACCOUNTANT, isActive: true },
      });
    }
    testAccountant = { id: acc.id, name: acc.name, email: acc.email, role: Role.ACCOUNTANT, isActive: true };

    // Purchasing
    let pur = await prisma.user.findFirst({ where: { role: Role.PURCHASING, isActive: true, deletedAt: null } });
    if (!pur) {
      pur = await prisma.user.create({
        data: { name: 'مسؤول المشتريات', email: `pur.auth.${Date.now()}@test.local`, role: Role.PURCHASING, isActive: true },
      });
    }
    testPurchasing = { id: pur.id, name: pur.name, email: pur.email, role: Role.PURCHASING, isActive: true };

    // Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-AUTH-${Date.now()}`,
        name: 'مشروع صلاحيات التقارير',
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

    await prisma.user.deleteMany({ where: { id: testEngineer2.id } });
  });

  it('enforces Engineer IDOR: Engineer 2 receives NOT_FOUND when accessing Engineer 1 report', async () => {
    // 1. Engineer 1 creates report
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer1);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer1);

    const report = await createProgressReportDraft({
      projectId: testProject.id,
      reportDate: '2025-08-01',
      title: 'تقرير المهندس 1',
      workDescription: 'أعمال سرية للمهندس 1.',
    });
    cleanupReportIds.push(report.id);

    // 2. Engineer 2 attempts to read report -> NOT_FOUND
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer2);
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer2);

    await expect(getProgressReport(report.id)).rejects.toThrowError(AppError);
    try {
      await getProgressReport(report.id);
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }

    // 3. Engineer 2 attempts to edit report -> NOT_FOUND
    await expect(updateProgressReportDraft(report.id, { title: 'تعديل مخترق' })).rejects.toThrowError(AppError);
    try {
      await updateProgressReportDraft(report.id, { title: 'تعديل مخترق' });
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }

    // 4. Engineer 2 attempts to submit report -> NOT_FOUND
    await expect(submitProgressReport(report.id)).rejects.toThrowError(AppError);
    try {
      await submitProgressReport(report.id);
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }

    // 5. Engineer 2 attempts to cancel report -> NOT_FOUND
    await expect(cancelProgressReport(report.id)).rejects.toThrowError(AppError);
    try {
      await cancelProgressReport(report.id);
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
  });

  it('denies Accountant and Purchasing access across progress report operations', async () => {
    // Accountant denied create
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireEngineer').mockRejectedValue(
      new permissions.PermissionError('FORBIDDEN', [Role.ENGINEER], Role.ACCOUNTANT),
    );

    await expect(
      createProgressReportDraft({
        projectId: testProject.id,
        reportDate: '2025-08-02',
        title: 'تقرير محاسب',
        workDescription: 'أعمال محاسب.',
      }),
    ).rejects.toThrow();

    // Purchasing denied read
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    await expect(getProgressReport('fake-id')).rejects.toThrowError(AppError);
  });

  it('getActiveProjectsForEngineer returns only ACTIVE non-deleted projects for any Engineer (BD-03 Model C)', async () => {
    vi.spyOn(permissions, 'requireEngineer').mockResolvedValue(testEngineer1);

    // Create a COMPLETED project
    const completedProject = await prisma.project.create({
      data: {
        code: `PRJ-COMP-${Date.now()}`,
        name: 'مشروع مكتمل',
        status: ProjectStatus.COMPLETED,
        managerId: testManager.id,
      },
    });
    cleanupProjectIds.push(completedProject.id);

    // Create a deleted ACTIVE project
    const deletedProject = await prisma.project.create({
      data: {
        code: `PRJ-DEL-${Date.now()}`,
        name: 'مشروع محذوف',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
        deletedAt: new Date(),
      },
    });
    cleanupProjectIds.push(deletedProject.id);

    const activeProjects = await getActiveProjectsForEngineer();
    const ids = activeProjects.map((p) => p.id);

    // Active project must be included
    expect(ids).toContain(testProject.id);
    // Completed project must NOT be included
    expect(ids).not.toContain(completedProject.id);
    // Deleted project must NOT be included
    expect(ids).not.toContain(deletedProject.id);
  });
});
