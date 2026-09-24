import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, AssignmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  assignEngineerToProject,
  removeEngineerFromProject,
  getProjectTeam,
  getActiveEngineersForAssignment,
  getActiveProjectEngineerCount,
  isEngineerAssignedToProject,
} from '@/lib/project-team';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Team CRUD & Query Lifecycle (Live PostgreSQL Integration)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer1: AuthenticatedUser;
  let testEngineer2: AuthenticatedUser;
  let testProject: { id: string; code: string; name: string };

  const cleanupAssignmentIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    const mgr = await prisma.user.create({
      data: {
        name: 'مدير اختبار الفريق',
        email: `mgr.team.${Date.now()}.${Math.random()}@test.local`,
        role: Role.MANAGER,
        isActive: true,
      },
    });
    cleanupUserIds.push(mgr.id);
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Engineer 1
    const eng1 = await prisma.user.create({
      data: {
        name: 'مهندس اختبار أول',
        email: `eng1.team.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng1.id);
    testEngineer1 = {
      id: eng1.id,
      name: eng1.name,
      email: eng1.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 3. Engineer 2
    const eng2 = await prisma.user.create({
      data: {
        name: 'مهندس اختبار ثان',
        email: `eng2.team.${Date.now()}.${Math.random()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    cleanupUserIds.push(eng2.id);
    testEngineer2 = {
      id: eng2.id,
      name: eng2.name,
      email: eng2.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Project
    const prj = await prisma.project.create({
      data: {
        code: `PRJ-TM-${Math.floor(Math.random() * 89999 + 10000)}`,
        name: 'مشروع اختبار إدارة الفريق',
        status: ProjectStatus.ACTIVE,
        managerId: testManager.id,
      },
    });
    cleanupProjectIds.push(prj.id);
    testProject = prj;

    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const aId of cleanupAssignmentIds) {
      await prisma.projectAssignment.deleteMany({ where: { id: aId } });
    }
    cleanupAssignmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;

    for (const uId of cleanupUserIds) {
      await prisma.user.deleteMany({ where: { id: uId } });
    }
    cleanupUserIds.length = 0;
  });

  it('assigns engineer to project and creates matching AuditLog record', async () => {
    const result = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
      reason: 'بدء أعمال الموقع',
    });
    cleanupAssignmentIds.push(result.assignmentId);

    expect(result.status).toBe('ACTIVE');
    expect(result.engineerId).toBe(testEngineer1.id);
    expect(result.projectId).toBe(testProject.id);
    expect(typeof result.assignedAt).toBe('string');
    expect(result.removedAt).toBeNull();

    // Verify DB row
    const dbAssignment = await prisma.projectAssignment.findUnique({
      where: { id: result.assignmentId },
    });
    expect(dbAssignment).not.toBeNull();
    expect(dbAssignment?.status).toBe(AssignmentStatus.ACTIVE);

    // Verify AuditLog row
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_ASSIGNED',
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(testManager.id);
    expect(auditLog?.metadata).toEqual(
      expect.objectContaining({
        assignmentId: result.assignmentId,
        projectId: testProject.id,
        engineerId: testEngineer1.id,
        isReactivation: false,
        reason: 'بدء أعمال الموقع',
      }),
    );
  });

  it('removes engineer with optional reason and marks status INACTIVE', async () => {
    const assignResult = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(assignResult.assignmentId);

    const removeResult = await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: assignResult.assignmentId,
      reason: 'نقل إلى فرع آخر',
    });

    expect(removeResult.status).toBe('INACTIVE');
    expect(typeof removeResult.removedAt).toBe('string');
    expect(removeResult.removalReason).toBe('نقل إلى فرع آخر');

    // Verify DB row
    const dbAssignment = await prisma.projectAssignment.findUnique({
      where: { id: assignResult.assignmentId },
    });
    expect(dbAssignment?.status).toBe(AssignmentStatus.INACTIVE);
    expect(dbAssignment?.removalReason).toBe('نقل إلى فرع آخر');
    expect(dbAssignment?.removedById).toBe(testManager.id);

    // Verify AuditLog row
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_REMOVED',
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.metadata).toEqual(
      expect.objectContaining({
        assignmentId: assignResult.assignmentId,
        reason: 'نقل إلى فرع آخر',
      }),
    );
  });

  it('reactivates an INACTIVE assignment without creating duplicate row', async () => {
    // 1. Assign
    const assign1 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(assign1.assignmentId);

    // 2. Remove
    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: assign1.assignmentId,
      reason: 'استبعاد مؤقت',
    });

    // 3. Reactivate via assignEngineerToProject
    const reactivateResult = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
      reason: 'إعادة التكليف بعد العودة',
    });

    // Proves identical assignmentId is reused
    expect(reactivateResult.assignmentId).toBe(assign1.assignmentId);
    expect(reactivateResult.status).toBe('ACTIVE');
    expect(reactivateResult.removedAt).toBeNull();
    expect(reactivateResult.removalReason).toBeNull();

    // Verify only ONE assignment row exists in PostgreSQL
    const allRows = await prisma.projectAssignment.findMany({
      where: { projectId: testProject.id, engineerId: testEngineer1.id },
    });
    expect(allRows).toHaveLength(1);
    expect(allRows[0]!.status).toBe(AssignmentStatus.ACTIVE);
    expect(allRows[0]!.removalReason).toBeNull();

    // Verify reactivation audit log entry
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PROJECT',
        entityId: testProject.id,
        action: 'PROJECT_ENGINEER_ASSIGNED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLogs).toHaveLength(2); // First assignment + reactivation
    expect(auditLogs[0]!.metadata).toEqual(
      expect.objectContaining({
        isReactivation: true,
        reason: 'إعادة التكليف بعد العودة',
      }),
    );
  });

  it('getProjectTeam returns active and inactive members, badges deactivated users', async () => {
    // Assign engineer 1 (active)
    const a1 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(a1.assignmentId);

    // Assign and remove engineer 2 (inactive)
    const a2 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer2.id,
    });
    cleanupAssignmentIds.push(a2.assignmentId);
    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: a2.assignmentId,
      reason: 'انتهاء المرحلة',
    });

    // Deactivate engineer 1 user account
    await prisma.user.update({
      where: { id: testEngineer1.id },
      data: { isActive: false },
    });

    const team = await getProjectTeam(testProject.id);

    expect(team).toHaveLength(2);
    // Active member first
    expect(team[0]!.engineerId).toBe(testEngineer1.id);
    expect(team[0]!.status).toBe('ACTIVE');
    expect(team[0]!.engineerIsActive).toBe(false); // Badged as deactivated

    // Inactive member second
    expect(team[1]!.engineerId).toBe(testEngineer2.id);
    expect(team[1]!.status).toBe('INACTIVE');
    expect(team[1]!.removalReason).toBe('انتهاء المرحلة');
  });

  it('getActiveEngineersForAssignment flags re-assignment candidates and excludes active assignments', async () => {
    // Initially both engineers available
    let available = await getActiveEngineersForAssignment(testProject.id);
    expect(available.some((e) => e.engineerId === testEngineer1.id)).toBe(true);
    expect(available.some((e) => e.engineerId === testEngineer2.id)).toBe(true);

    // Assign engineer 1
    const a1 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(a1.assignmentId);

    // Engineer 1 now excluded from candidates
    available = await getActiveEngineersForAssignment(testProject.id);
    expect(available.some((e) => e.engineerId === testEngineer1.id)).toBe(false);

    // Remove engineer 1 -> becomes reassignment candidate
    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: a1.assignmentId,
    });

    available = await getActiveEngineersForAssignment(testProject.id);
    const candidate1 = available.find((e) => e.engineerId === testEngineer1.id);
    expect(candidate1).toBeDefined();
    expect(candidate1?.isReassignmentCandidate).toBe(true);
  });

  it('getActiveProjectEngineerCount accurately counts active assignments', async () => {
    expect(await getActiveProjectEngineerCount(testProject.id)).toBe(0);

    const a1 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(a1.assignmentId);
    expect(await getActiveProjectEngineerCount(testProject.id)).toBe(1);

    const a2 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer2.id,
    });
    cleanupAssignmentIds.push(a2.assignmentId);
    expect(await getActiveProjectEngineerCount(testProject.id)).toBe(2);

    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: a1.assignmentId,
    });
    expect(await getActiveProjectEngineerCount(testProject.id)).toBe(1);
  });

  it('isEngineerAssignedToProject correctly verifies relationship truth', async () => {
    expect(await isEngineerAssignedToProject(testProject.id, testEngineer1.id)).toBe(false);

    const a1 = await assignEngineerToProject({
      projectId: testProject.id,
      engineerId: testEngineer1.id,
    });
    cleanupAssignmentIds.push(a1.assignmentId);
    expect(await isEngineerAssignedToProject(testProject.id, testEngineer1.id)).toBe(true);

    await removeEngineerFromProject({
      projectId: testProject.id,
      assignmentId: a1.assignmentId,
    });
    expect(await isEngineerAssignedToProject(testProject.id, testEngineer1.id)).toBe(false);
  });
});
