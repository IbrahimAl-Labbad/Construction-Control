import { describe, it, expect } from 'vitest';
import { ProgressReportStatus } from '@prisma/client';
import type {
  ProgressReportWithRelations} from '@/lib/progress-reports/mappers';
import {
  toProgressReportDetailDTO,
  toProgressReportListItemDTO
} from '@/lib/progress-reports/mappers';

describe('ProgressReport Mappers', () => {
  const mockEntity: ProgressReportWithRelations = {
    id: 'report-cuid-123',
    projectId: 'project-cuid-456',
    project: {
      id: 'project-cuid-456',
      code: 'PRJ-001',
      name: 'مشروع برج الرياض',
    },
    reportDate: new Date('2025-04-15T00:00:00.000Z'),
    title: 'تقرير الأعمال الميدانية',
    workDescription: 'أعمال التسليح والصب للقواعد.',
    progressPercentage: 40,
    blockers: 'رياح شديدة أوقفت الرافعة لساعتين',
    nextPeriodPlan: 'استكمال العزل',
    weatherCondition: 'مغبر',
    status: ProgressReportStatus.SUBMITTED,
    createdById: 'user-engineer-1',
    createdBy: {
      id: 'user-engineer-1',
      name: 'المهندس أحمد',
    },
    submittedAt: new Date('2025-04-15T14:30:00.000Z'),
    approvedById: null,
    approvedBy: null,
    approvedAt: null,
    rejectedById: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledById: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    deletedAt: null,
    createdAt: new Date('2025-04-15T12:00:00.000Z'),
    updatedAt: new Date('2025-04-15T14:30:00.000Z'),
  };

  it('toProgressReportDetailDTO maps fields, formats dates, and enforces privacy', () => {
    const dto = toProgressReportDetailDTO(mockEntity);

    // Date formatting
    expect(dto.reportDate).toBe('2025-04-15');
    expect(dto.submittedAt).toBe('2025-04-15T14:30:00.000Z');
    expect(dto.createdAt).toBe('2025-04-15T12:00:00.000Z');
    expect(dto.updatedAt).toBe('2025-04-15T14:30:00.000Z');

    // Values
    expect(dto.id).toBe('report-cuid-123');
    expect(dto.title).toBe('تقرير الأعمال الميدانية');
    expect(dto.progressPercentage).toBe(40);
    expect(dto.status).toBe(ProgressReportStatus.SUBMITTED);

    // Actor privacy: only { id, name }
    expect(dto.createdBy).toEqual({
      id: 'user-engineer-1',
      name: 'المهندس أحمد',
    });
    expect((dto.createdBy as unknown as Record<string, unknown>).email).toBeUndefined();

    // Verify submittedById is not on DTO
    expect((dto as unknown as Record<string, unknown>).submittedById).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).submittedBy).toBeUndefined();
  });

  it('toProgressReportListItemDTO maps table list projection cleanly', () => {
    const dto = toProgressReportListItemDTO(mockEntity);

    expect(dto.id).toBe('report-cuid-123');
    expect(dto.reportDate).toBe('2025-04-15');
    expect(dto.title).toBe('تقرير الأعمال الميدانية');
    expect(dto.progressPercentage).toBe(40);
    expect(dto.status).toBe(ProgressReportStatus.SUBMITTED);
    expect(dto.project?.code).toBe('PRJ-001');
    expect(dto.createdBy?.name).toBe('المهندس أحمد');

    // Narrative details omitted from list DTO
    expect((dto as unknown as Record<string, unknown>).workDescription).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).blockers).toBeUndefined();
  });
});
