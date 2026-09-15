/**
 * tests/unit/lib/project-use-cases-b.test.ts
 *
 * Unit tests for Phase B Project management use cases:
 * - updateProject
 * - changeProjectStatus
 * - assignProjectManager
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';

import { updateProject, changeProjectStatus, assignProjectManager } from '@/lib/projects';
import { prisma } from '@/lib/db/prisma';
import * as permissions from '@/lib/permissions';
import { ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions/guards';
import type { AuthenticatedUser } from '@/lib/auth/types';

const { PLANNED, ACTIVE, ON_HOLD, COMPLETED, CANCELLED } = ProjectStatus;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockManager: AuthenticatedUser = {
  id: 'manager-123',
  name: 'المدير التنفيذي',
  email: 'manager@test.local',
  role: Role.MANAGER,
  isActive: true,
};

const existingProject = {
  id: 'proj-abc',
  code: 'PRJ-001',
  name: 'مشروع الرياض الأول',
  description: 'وصف قديم',
  location: 'الرياض',
  status: PLANNED,
  managerId: 'manager-123',
  manager: {
    id: 'manager-123',
    name: 'المدير التنفيذي',
    email: 'manager@test.local',
  },
  startDate: null,
  endDate: null,
  deletedAt: null,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// updateProject
// ===========================================================================

describe('updateProject', () => {
  it('throws PermissionError if caller is not a Manager', async () => {
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    await expect(updateProject('proj-abc', { name: 'اسم جديد' })).rejects.toThrow(PermissionError);
  });

  it('throws ValidationError if projectId is empty', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(updateProject('', { name: 'اسم' })).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError if name is too short', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(updateProject('proj-abc', { name: 'أ' })).rejects.toThrow(ValidationError);
  });

  it('throws NOT_FOUND if project does not exist', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

    await expect(
      updateProject('proj-abc', { name: 'اسم جديد' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('returns existing project without DB write if nothing changed', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    const txSpy = vi.spyOn(prisma, '$transaction');

    const result = await updateProject('proj-abc', {
      name: existingProject.name,
      description: existingProject.description,
      location: existingProject.location,
    });

    expect(txSpy).not.toHaveBeenCalled();
    expect(result.id).toBe(existingProject.id);
  });

  it('updates project and writes audit log when fields change', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    const updatedProject = { ...existingProject, name: 'اسم محدث' };
    const mockTx = {
      project: { update: vi.fn().mockResolvedValue(updatedProject) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await updateProject('proj-abc', {
      name: 'اسم محدث',
      description: existingProject.description,
      location: existingProject.location,
    });

    expect(result.name).toBe('اسم محدث');
    expect(mockTx.project.update).toHaveBeenCalledTimes(1);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_UPDATED',
          entityType: 'PROJECT',
          entityId: 'proj-abc',
        }),
      }),
    );
  });

  it('audit delta contains ONLY changed fields', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    const updatedProject = { ...existingProject, name: 'اسم محدث' };
    const mockTx = {
      project: { update: vi.fn().mockResolvedValue(updatedProject) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    await updateProject('proj-abc', {
      name: 'اسم محدث', // changed
      description: existingProject.description, // unchanged
      location: existingProject.location, // unchanged
    });

    const auditCall = mockTx.auditLog.create.mock.calls[0]?.[0];
    const changedKeys = Object.keys((auditCall?.data?.metadata as Record<string, unknown>)?.changes as Record<string, unknown> ?? {});
    expect(changedKeys).toContain('name');
    expect(changedKeys).not.toContain('description');
    expect(changedKeys).not.toContain('location');
  });
});

// ===========================================================================
// changeProjectStatus
// ===========================================================================

describe('changeProjectStatus', () => {
  it('throws PermissionError if caller is not a Manager', async () => {
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    await expect(changeProjectStatus('proj-abc', { newStatus: ACTIVE })).rejects.toThrow(
      PermissionError,
    );
  });

  it('throws ValidationError if newStatus is invalid', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(
      changeProjectStatus('proj-abc', { newStatus: 'INVALID_STATUS' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NOT_FOUND if project does not exist', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

    await expect(
      changeProjectStatus('proj-abc', { newStatus: ACTIVE }),
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('throws INVALID_STATE_TRANSITION for PLANNED → COMPLETED', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    await expect(
      changeProjectStatus('proj-abc', { newStatus: COMPLETED }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('throws INVALID_STATE_TRANSITION for terminal COMPLETED state', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      ...existingProject,
      status: COMPLETED,
    } as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>);

    await expect(
      changeProjectStatus('proj-abc', { newStatus: ACTIVE }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('throws INVALID_STATE_TRANSITION for terminal CANCELLED state', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      ...existingProject,
      status: CANCELLED,
    } as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>);

    await expect(
      changeProjectStatus('proj-abc', { newStatus: ACTIVE }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('changes status and writes PROJECT_STATUS_CHANGED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    const updatedProject = { ...existingProject, status: ACTIVE };
    const mockTx = {
      project: { update: vi.fn().mockResolvedValue(updatedProject) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-2' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await changeProjectStatus('proj-abc', {
      newStatus: ACTIVE,
      reason: 'بدأ العمل الفعلي',
    });

    expect(result.status).toBe(ACTIVE);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_STATUS_CHANGED',
          entityType: 'PROJECT',
          entityId: 'proj-abc',
          metadata: expect.objectContaining({
            previousStatus: PLANNED,
            newStatus: ACTIVE,
            reason: 'بدأ العمل الفعلي',
          }),
        }),
      }),
    );
  });

  it('valid transition ON_HOLD → ACTIVE passes without error', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue({
      ...existingProject,
      status: ON_HOLD,
    } as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>);

    const mockTx = {
      project: { update: vi.fn().mockResolvedValue({ ...existingProject, status: ACTIVE }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-3' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    await expect(
      changeProjectStatus('proj-abc', { newStatus: ACTIVE }),
    ).resolves.not.toThrow();
  });
});

// ===========================================================================
// assignProjectManager
// ===========================================================================

describe('assignProjectManager', () => {
  const newManagerRecord = {
    id: 'manager-456',
    name: 'مدير المشروع الجديد',
    email: 'manager2@test.local',
    role: Role.MANAGER,
    isActive: true,
    deletedAt: null,
  };

  it('throws PermissionError if caller is not a Manager', async () => {
    vi.spyOn(permissions, 'requireManager').mockRejectedValue(
      new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
    );

    await expect(
      assignProjectManager('proj-abc', { newManagerId: 'manager-456' }),
    ).rejects.toThrow(PermissionError);
  });

  it('throws ValidationError if newManagerId is empty', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

    await expect(
      assignProjectManager('proj-abc', { newManagerId: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NOT_FOUND if project does not exist', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

    await expect(
      assignProjectManager('proj-abc', { newManagerId: 'manager-456' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('throws CONFLICT if new manager is the same as current manager', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );

    await expect(
      assignProjectManager('proj-abc', { newManagerId: existingProject.managerId }),
    ).rejects.toThrow(expect.objectContaining({ code: 'CONFLICT' }));
  });

  it('throws INVALID_MANAGER if new manager does not exist', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    await expect(
      assignProjectManager('proj-abc', { newManagerId: 'manager-456' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_MANAGER' }));
  });

  it('throws INVALID_MANAGER if new manager has ENGINEER role', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      ...newManagerRecord,
      role: Role.ENGINEER,
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await expect(
      assignProjectManager('proj-abc', { newManagerId: 'manager-456' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_MANAGER' }));
  });

  it('throws INVALID_MANAGER if new manager is inactive', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      ...newManagerRecord,
      isActive: false,
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await expect(
      assignProjectManager('proj-abc', { newManagerId: 'manager-456' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_MANAGER' }));
  });

  it('assigns manager and writes PROJECT_MANAGER_ASSIGNED audit log', async () => {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
    vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
      existingProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      newManagerRecord as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>,
    );

    const updatedProject = {
      ...existingProject,
      managerId: 'manager-456',
      manager: {
        id: 'manager-456',
        name: newManagerRecord.name,
        email: newManagerRecord.email,
      },
    };
    const mockTx = {
      project: { update: vi.fn().mockResolvedValue(updatedProject) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-4' }) },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const result = await assignProjectManager('proj-abc', {
      newManagerId: 'manager-456',
      reason: 'نقل المسؤولية',
    });

    expect(result.managerId).toBe('manager-456');
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_MANAGER_ASSIGNED',
          entityType: 'PROJECT',
          entityId: 'proj-abc',
          metadata: expect.objectContaining({
            previousManagerId: 'manager-123',
            newManagerId: 'manager-456',
            reason: 'نقل المسؤولية',
          }),
        }),
      }),
    );
  });
});
