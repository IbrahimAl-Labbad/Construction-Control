/**
 * tests/unit/lib/project-use-cases.test.ts
 *
 * Unit tests for Project management use cases:
 * - createProject
 * - listProjects
 * - getProject
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, ProjectStatus } from '@prisma/client';

import { createProject, listProjects, getProject } from '@/lib/projects';
import { prisma } from '@/lib/db/prisma';
import * as permissions from '@/lib/permissions';
import { ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions/guards';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Project Use Cases', () => {
  const mockManager: AuthenticatedUser = {
    id: 'manager-123',
    name: 'المدير التنفيذي',
    email: 'manager@test.local',
    role: Role.MANAGER,
    isActive: true,
  };

  const targetManagerRecord = {
    id: 'manager-123',
    name: 'المدير التنفيذي',
    email: 'manager@test.local',
    role: Role.MANAGER,
    isActive: true,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    const validRawInput = {
      code: 'PRJ-101',
      name: 'مشروع مجمع الرياض',
      description: 'أعمال البنية التحتية',
      location: 'الرياض',
      managerId: 'manager-123',
      startDate: '2026-11-01',
      endDate: '2027-11-01',
    };

    it('throws PermissionError if caller is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(createProject(validRawInput)).rejects.toThrow(PermissionError);
    });

    it('throws ValidationError when input schema fails', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      await expect(
        createProject({ ...validRawInput, code: 'X' }), // too short
      ).rejects.toThrow(ValidationError);
    });

    it('throws ALREADY_EXISTS when project code is already taken', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue({
        id: 'existing-proj-id',
      } as unknown as Awaited<ReturnType<typeof prisma.project.findUnique>>);

      await expect(createProject(validRawInput)).rejects.toThrow(
        expect.objectContaining({ code: 'ALREADY_EXISTS' }),
      );
    });

    it('throws INVALID_MANAGER when manager does not exist', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(createProject(validRawInput)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_MANAGER' }),
      );
    });

    it('throws INVALID_MANAGER when target user has ENGINEER role', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...targetManagerRecord,
        role: Role.ENGINEER,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(createProject(validRawInput)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_MANAGER' }),
      );
    });

    it('throws INVALID_MANAGER when target manager is inactive', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...targetManagerRecord,
        isActive: false,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(createProject(validRawInput)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_MANAGER' }),
      );
    });

    it('throws INVALID_MANAGER when target manager is soft-deleted', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...targetManagerRecord,
        deletedAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(createProject(validRawInput)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_MANAGER' }),
      );
    });

    it('creates Project and PROJECT_CREATED AuditLog atomically in transaction', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
        targetManagerRecord as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>,
      );

      const mockCreatedProject = {
        id: 'proj-456',
        code: 'PRJ-101',
        name: validRawInput.name,
        description: validRawInput.description,
        location: validRawInput.location,
        status: ProjectStatus.PLANNED,
        managerId: 'manager-123',
        manager: {
          id: 'manager-123',
          name: targetManagerRecord.name,
          email: targetManagerRecord.email,
        },
        startDate: new Date('2026-11-01'),
        endDate: new Date('2027-11-01'),
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTx = {
        project: {
          create: vi.fn().mockResolvedValue(mockCreatedProject),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-proj-1' }),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback(mockTx as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
      });

      const result = await createProject(validRawInput);

      expect(result.id).toBe('proj-456');
      expect(result.code).toBe('PRJ-101');
      expect(result.status).toBe(ProjectStatus.PLANNED);
      expect(mockTx.project.create).toHaveBeenCalledTimes(1);
      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: mockManager.id,
            action: 'PROJECT_CREATED',
            entityType: 'PROJECT',
            entityId: 'proj-456',
          }),
        }),
      );
    });
  });

  describe('listProjects', () => {
    it('throws PermissionError if caller is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(listProjects()).rejects.toThrow(PermissionError);
    });

    it('queries active projects excluding soft-deleted ones', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const mockList = [
        {
          id: 'proj-1',
          code: 'PRJ-1',
          name: 'مشروع 1',
          description: null,
          location: null,
          status: ProjectStatus.PLANNED,
          managerId: 'manager-123',
          manager: { id: 'manager-123', name: 'المدير', email: 'm@test.local' },
          startDate: null,
          endDate: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(prisma.project, 'findMany').mockResolvedValue(
        mockList as unknown as Awaited<ReturnType<typeof prisma.project.findMany>>,
      );

      const result = await listProjects();

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('PRJ-1');
    });
  });

  describe('getProject', () => {
    it('throws PermissionError if caller is not a Manager', async () => {
      vi.spyOn(permissions, 'requireManager').mockRejectedValue(
        new PermissionError('INSUFFICIENT_ROLE', [Role.MANAGER], Role.ENGINEER),
      );

      await expect(getProject('proj-1')).rejects.toThrow(PermissionError);
    });

    it('throws ValidationError if projectId is empty', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      await expect(getProject('')).rejects.toThrow(ValidationError);
    });

    it('throws NOT_FOUND if project does not exist or is soft-deleted', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);
      vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);

      await expect(getProject('non-existent')).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('returns project details when found', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const mockProject = {
        id: 'proj-1',
        code: 'PRJ-1',
        name: 'مشروع 1',
        description: 'تفاصيل المشروع',
        location: 'الرياض',
        status: ProjectStatus.PLANNED,
        managerId: 'manager-123',
        manager: { id: 'manager-123', name: 'المدير', email: 'm@test.local' },
        startDate: new Date('2026-10-01'),
        endDate: new Date('2027-10-01'),
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.project, 'findFirst').mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof prisma.project.findFirst>>,
      );

      const result = await getProject('proj-1');

      expect(result.id).toBe('proj-1');
      expect(result.code).toBe('PRJ-1');
      expect(result.description).toBe('تفاصيل المشروع');
    });
  });
});
