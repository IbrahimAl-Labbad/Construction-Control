/**
 * tests/unit/lib/commitment-mappers.test.ts
 *
 * Unit tests for Commitment mappers.
 * Proves Decimal -> string formatting and DTO safety.
 */

import { describe, expect, it } from 'vitest';
import { BudgetCategory, CommitmentStatus, Prisma } from '@prisma/client';

import { toCommitmentSummaryDTO } from '@/lib/commitments/mappers';

describe('Commitment Mappers', () => {
  it('converts Prisma Commitment record to client-safe DTO with Decimal as string', () => {
    const rawCommitment = {
      id: 'comm_123',
      projectId: 'proj_123',
      budgetLineId: 'line_123',
      referenceNumber: 'PO-2026-999',
      vendorName: 'شركة التوريدات العالمية',
      amount: new Prisma.Decimal('45000.75'),
      currency: 'SAR',
      description: 'أمر توريد معدات حفر وتكسير',
      commitmentDate: new Date('2026-03-15T00:00:00.000Z'),
      status: CommitmentStatus.APPROVED,
      createdById: 'user_purchasing',
      submittedById: 'user_purchasing',
      submittedAt: new Date('2026-03-15T09:00:00.000Z'),
      approvedById: 'user_manager',
      approvedAt: new Date('2026-03-15T10:00:00.000Z'),
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
      deletedAt: null,
      createdAt: new Date('2026-03-15T08:00:00.000Z'),
      updatedAt: new Date('2026-03-15T10:00:00.000Z'),

      createdBy: {
        id: 'user_purchasing',
        name: 'أحمد مسؤول المشتريات',
        email: 'ahmed@company.com',
      },
      submittedBy: {
        id: 'user_purchasing',
        name: 'أحمد مسؤول المشتريات',
        email: 'ahmed@company.com',
      },
      approvedBy: {
        id: 'user_manager',
        name: 'المدير العام',
        email: 'manager@company.com',
      },
      rejectedBy: null,
      budgetLine: {
        id: 'line_123',
        category: BudgetCategory.EQUIPMENT,
        description: 'إيجار وتوريد معدات الموقع',
        amount: new Prisma.Decimal('100000.00'),
      },
      project: {
        id: 'proj_123',
        name: 'مشروع برج النخيل',
        code: 'PRJ-NKH-01',
      },
    };

    const dto = toCommitmentSummaryDTO(rawCommitment);

    expect(dto.id).toBe('comm_123');
    expect(dto.amount).toBe('45000.75'); // formatted string!
    expect(dto.referenceNumber).toBe('PO-2026-999');
    expect(dto.vendorName).toBe('شركة التوريدات العالمية');
    expect(dto.status).toBe(CommitmentStatus.APPROVED);
    expect(dto.createdBy.name).toBe('أحمد مسؤول المشتريات');
    expect(dto.approvedBy?.name).toBe('المدير العام');
    expect(dto.rejectedBy).toBeNull();
    expect(dto.project?.name).toBe('مشروع برج النخيل');
    expect(dto.budgetLine?.amount).toBe('100000.00'); // line amount formatted string!
  });

  it('handles null optional relations safely', () => {
    const rawCommitment = {
      id: 'comm_draft',
      projectId: 'proj_123',
      budgetLineId: 'line_123',
      referenceNumber: null,
      vendorName: 'مورد مواد العزل',
      amount: new Prisma.Decimal('8000.00'),
      currency: 'SAR',
      description: 'مسودة توريد مواد عزل مائي',
      commitmentDate: new Date('2026-03-16T00:00:00.000Z'),
      status: CommitmentStatus.DRAFT,
      createdById: 'user_purchasing',
      submittedById: null,
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
      deletedAt: null,
      createdAt: new Date('2026-03-16T08:00:00.000Z'),
      updatedAt: new Date('2026-03-16T08:00:00.000Z'),

      createdBy: {
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@company.com',
      },
    };

    const dto = toCommitmentSummaryDTO(rawCommitment);

    expect(dto.id).toBe('comm_draft');
    expect(dto.referenceNumber).toBeNull();
    expect(dto.submittedById).toBeNull();
    expect(dto.submittedBy).toBeNull();
    expect(dto.approvedBy).toBeNull();
    expect(dto.project).toBeUndefined();
    expect(dto.budgetLine).toBeUndefined();
  });
});
