import { describe, expect, it } from 'vitest';
import { AssignmentStatus, ProjectStatus, Prisma } from '@prisma/client';
import {
  toProjectTeamMemberDTO,
  toAssignedProjectOptionDTO,
  isProjectAssignmentUniqueViolation,
  type ProjectAssignmentWithRelations,
  type ProjectAssignmentWithProject,
} from '@/lib/project-team/mappers';

describe('Project Team Mappers & Error Helpers (Unit)', () => {
  describe('toProjectTeamMemberDTO', () => {
    it('serializes Date fields to ISO 8601 strings and maps relations correctly', () => {
      const assignedDate = new Date('2026-09-01T08:00:00.000Z');
      const removedDate = new Date('2026-09-20T17:00:00.000Z');

      const mockRecord: ProjectAssignmentWithRelations = {
        id: 'assign-1',
        projectId: 'proj-1',
        engineerId: 'eng-1',
        status: AssignmentStatus.INACTIVE,
        assignedAt: assignedDate,
        removedAt: removedDate,
        removalReason: 'اكتمال مرحلة التأسيس',
        engineer: {
          id: 'eng-1',
          name: 'م. خالد أحمد',
          email: 'khaled@test.local',
          isActive: true,
        },
        assignedBy: {
          name: 'المدير العام',
        },
        removedBy: {
          name: 'مدير العمليات',
        },
      };

      const dto = toProjectTeamMemberDTO(mockRecord);

      expect(dto.assignmentId).toBe('assign-1');
      expect(dto.projectId).toBe('proj-1');
      expect(dto.engineerId).toBe('eng-1');
      expect(dto.engineerName).toBe('م. خالد أحمد');
      expect(dto.engineerEmail).toBe('khaled@test.local');
      expect(dto.engineerIsActive).toBe(true);
      expect(dto.status).toBe('INACTIVE');
      expect(dto.assignedAt).toBe('2026-09-01T08:00:00.000Z');
      expect(dto.assignedByName).toBe('المدير العام');
      expect(dto.removedAt).toBe('2026-09-20T17:00:00.000Z');
      expect(dto.removedByName).toBe('مدير العمليات');
      expect(dto.removalReason).toBe('اكتمال مرحلة التأسيس');
    });

    it('handles active assignments with null removal fields safely', () => {
      const assignedDate = new Date('2026-09-15T10:30:00.000Z');

      const mockRecord: ProjectAssignmentWithRelations = {
        id: 'assign-2',
        projectId: 'proj-1',
        engineerId: 'eng-2',
        status: AssignmentStatus.ACTIVE,
        assignedAt: assignedDate,
        removedAt: null,
        removalReason: null,
        engineer: {
          id: 'eng-2',
          name: 'م. سارة علي',
          email: 'sara@test.local',
          isActive: false,
        },
        assignedBy: {
          name: 'المدير التنفيذي',
        },
        removedBy: null,
      };

      const dto = toProjectTeamMemberDTO(mockRecord);

      expect(dto.status).toBe('ACTIVE');
      expect(dto.engineerIsActive).toBe(false);
      expect(dto.assignedAt).toBe('2026-09-15T10:30:00.000Z');
      expect(dto.removedAt).toBeNull();
      expect(dto.removedByName).toBeNull();
      expect(dto.removalReason).toBeNull();
    });
  });

  describe('toAssignedProjectOptionDTO', () => {
    it('serializes project option for engineer with ISO date string', () => {
      const assignedDate = new Date('2026-09-10T12:00:00.000Z');

      const mockItem: ProjectAssignmentWithProject = {
        assignedAt: assignedDate,
        project: {
          id: 'proj-10',
          code: 'PRJ-10',
          name: 'مشروع مجمع الروابي',
          status: ProjectStatus.ACTIVE,
        },
      };

      const dto = toAssignedProjectOptionDTO(mockItem);

      expect(dto).toEqual({
        projectId: 'proj-10',
        projectCode: 'PRJ-10',
        projectName: 'مشروع مجمع الروابي',
        projectStatus: 'ACTIVE',
        assignedAt: '2026-09-10T12:00:00.000Z',
      });
    });
  });

  describe('isProjectAssignmentUniqueViolation (Safety-Net Helper)', () => {
    it('returns true for Prisma P2002 error targeting (projectId, engineerId)', () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`projectId`,`engineerId`)',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
          meta: {
            target: ['projectId', 'engineerId'],
          },
        },
      );

      expect(isProjectAssignmentUniqueViolation(p2002Error)).toBe(true);
    });

    it('returns true when target is a formatted string containing both fields', () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique error', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: {
          target: 'project_assignments_projectId_engineerId_key',
        },
      });

      expect(isProjectAssignmentUniqueViolation(p2002Error)).toBe(true);
    });

    it('returns false for P2002 errors on other entities or fields', () => {
      const emailUniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on email',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
          meta: {
            target: ['email'],
          },
        },
      );

      expect(isProjectAssignmentUniqueViolation(emailUniqueError)).toBe(false);
    });

    it('returns false for other Prisma errors and generic errors', () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
      });

      expect(isProjectAssignmentUniqueViolation(p2025Error)).toBe(false);
      expect(isProjectAssignmentUniqueViolation(new Error('Generic error'))).toBe(false);
      expect(isProjectAssignmentUniqueViolation(null)).toBe(false);
    });
  });
});
