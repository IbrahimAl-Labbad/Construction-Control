import { describe, expect, it } from 'vitest';
import { MilestoneStatus } from '@prisma/client';
import { toProjectMilestoneDTO } from '@/lib/milestones/mappers';

describe('Milestone Mappers (Unit Tests)', () => {
  it('maps ProjectMilestone entity to clean DTO without leaking Date objects or deletedAt', () => {
    const rawEntity = {
      id: 'm-123',
      projectId: 'proj-456',
      title: 'صَب الأساسات',
      description: 'وصف المحطة',
      targetDate: new Date('2026-10-15T00:00:00.000Z'),
      achievedAt: new Date('2026-10-14T14:30:00.000Z'),
      status: MilestoneStatus.COMPLETED,
      orderIndex: 2,
      createdById: 'user-mgr-1',
      createdBy: {
        id: 'user-mgr-1',
        name: 'مدير المشروع',
      },
      updatedById: 'user-mgr-2',
      updatedBy: {
        id: 'user-mgr-2',
        name: 'مدير تنفيذي',
      },
      deletedAt: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T14:30:00.000Z'),
    };

    const dto = toProjectMilestoneDTO(rawEntity, '2026-10-20');

    expect(dto.id).toBe('m-123');
    expect(dto.projectId).toBe('proj-456');
    expect(dto.title).toBe('صَب الأساسات');
    expect(dto.description).toBe('وصف المحطة');
    expect(dto.targetDate).toBe('2026-10-15');
    expect(dto.achievedAt).toBe('2026-10-14T14:30:00.000Z');
    expect(dto.status).toBe(MilestoneStatus.COMPLETED);
    expect(dto.isOverdue).toBe(false); // Completed is never overdue
    expect(dto.orderIndex).toBe(2);
    expect(dto.createdById).toBe('user-mgr-1');
    expect(dto.creatorName).toBe('مدير المشروع');
    expect(dto.updatedById).toBe('user-mgr-2');
    expect(dto.updaterName).toBe('مدير تنفيذي');
    expect(dto.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-10-14T14:30:00.000Z');

    // deletedAt must NOT be exposed
    expect('deletedAt' in dto).toBe(false);
  });
});
