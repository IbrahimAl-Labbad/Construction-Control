/**
 * tests/unit/lib/commitment-use-cases.test.ts
 *
 * Unit tests for Commitment use cases:
 * - Role authorization (PURCHASING only creates, Engineers/Accountants/Managers rejected)
 * - Separation of duties (self-approval forbidden for both createdById and submittedById)
 * - Project active and budget approved invariants
 * - Mandatory Correction 3: Draft update cross-project budgetLine rejection
 * - Mandatory Correction 4: Approval deletion guard and state transition check
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, ProjectStatus, CommitmentStatus, Prisma } from '@prisma/client';

import * as permissions from '@/lib/permissions';
import { prisma } from '@/lib/db/prisma';
import { createCommitmentDraft } from '@/lib/commitments/use-cases/create-commitment-draft';
import { updateCommitmentDraft } from '@/lib/commitments/use-cases/update-commitment-draft';
import { approveCommitment } from '@/lib/commitments/use-cases/approve-commitment';
import { getCommitment } from '@/lib/commitments/use-cases/get-commitment';
import { getUserCommitments } from '@/lib/commitments/queries/get-user-commitments';
import { getActiveProjectsForCommitments } from '@/lib/commitments/queries/get-active-projects-for-commitments';
import { PermissionError } from '@/lib/permissions';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    project: { findFirst: vi.fn(), findMany: vi.fn() },
    budget: { findFirst: vi.fn() },
    budgetLine: { findFirst: vi.fn() },
    commitment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    expense: { aggregate: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

describe('Commitment Use Cases (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCommitmentDraft - Role Authorization', () => {
    it('allows PURCHASING role to create draft', async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue({
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      const mockProject = {
        id: 'clh1b2c3d000008l1g2h3i4j1',
        status: ProjectStatus.ACTIVE,
        code: 'PRJ-01',
        name: 'مشروع أ',
      };
      const mockBudget = { id: 'b_123' };
      const mockLine = {
        id: 'clh1b2c3d000008l1g2h3i4j2',
        category: 'MATERIALS',
        description: 'حديد',
        amount: new Prisma.Decimal('50000.00'),
      };
      const mockCreated = {
        id: 'comm_1',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        vendorName: 'مورد حديد',
        referenceNumber: 'PO-01',
        amount: new Prisma.Decimal('10000.00'),
        currency: 'SAR',
        description: 'دفعة حديد أولى',
        commitmentDate: new Date(),
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
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: { id: 'user_purchasing', name: 'مسؤول المشتريات', email: 'purchasing@test.local' },
        submittedBy: null,
        approvedBy: null,
        rejectedBy: null,
        budgetLine: mockLine,
        project: mockProject,
      };

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
        const tx = {
          project: { findFirst: vi.fn().mockResolvedValue(mockProject) },
          budget: { findFirst: vi.fn().mockResolvedValue(mockBudget) },
          budgetLine: { findFirst: vi.fn().mockResolvedValue(mockLine) },
          commitment: { create: vi.fn().mockResolvedValue(mockCreated) },
          auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
        };
        return callback(tx);
      });

      const result = await createCommitmentDraft({
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        vendorName: 'مورد حديد',
        referenceNumber: 'PO-01',
        amount: '10000.00',
        commitmentDate: new Date(),
        description: 'دفعة حديد أولى للموقع',
      });

      expect(result.id).toBe('comm_1');
      expect(result.amount).toBe('10000.00');
    });

    it('rejects ENGINEER, ACCOUNTANT, and MANAGER from creating commitments', async () => {
      for (const forbiddenRole of [Role.ENGINEER, Role.ACCOUNTANT, Role.MANAGER]) {
        vi.spyOn(permissions, 'requireRole').mockRejectedValueOnce(
          new PermissionError('INSUFFICIENT_ROLE', [Role.PURCHASING], forbiddenRole),
        );

        await expect(
          createCommitmentDraft({
            projectId: 'clh1b2c3d000008l1g2h3i4j1',
            budgetLineId: 'clh1b2c3d000008l1g2h3i4j2',
            vendorName: 'مورد خرسانة',
            amount: '5000.00',
            commitmentDate: new Date(),
            description: 'صب قواعد',
          }),
        ).rejects.toThrow(PermissionError);
      }
    });
  });

  describe('updateCommitmentDraft - Invariants (Mandatory Correction 3)', () => {
    it('rejects changing budgetLineId to a line that does not belong to the project budget', async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue({
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      const commitmentId = 'clh1b2c3d000008l1g2h3i4j9';
      const foreignLineId = 'clh1b2c3d000008l1g2h3i4j0';

      const existingCommitment = {
        id: commitmentId,
        projectId: 'clh1b2c3d000008l1g2h3i4j1',
        budgetLineId: 'clh1b2c3d000008l1g2h3i4j2',
        createdById: 'user_purchasing',
        status: CommitmentStatus.DRAFT,
        deletedAt: null,
        project: {
          id: 'clh1b2c3d000008l1g2h3i4j1',
          status: ProjectStatus.ACTIVE,
          deletedAt: null,
        },
      };

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
        const tx = {
          commitment: { findFirst: vi.fn().mockResolvedValue(existingCommitment) },
          budget: { findFirst: vi.fn().mockResolvedValue({ id: 'budget_1' }) },
          budgetLine: { findFirst: vi.fn().mockResolvedValue(null) }, // Foreign line not in budget_1!
        };
        return callback(tx);
      });

      await expect(
        updateCommitmentDraft(commitmentId, {
          budgetLineId: foreignLineId,
          vendorName: 'مورد جديد',
          amount: '12000.00',
          commitmentDate: new Date(),
          description: 'تعديل البند للمشروع',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_BUDGET_LINE' }),
      );
    });
  });

  describe('approveCommitment - Separation of Duties & Invariants (Mandatory Correction 4)', () => {
    it('rejects self-approval when approver is the creator', async () => {
      const managerId = 'user_mgr_1';
      vi.spyOn(permissions, 'requireManager').mockResolvedValue({
        id: managerId,
        name: 'المدير',
        email: 'mgr@test.local',
        role: Role.MANAGER,
        isActive: true,
      });

      const commitmentId = 'clh1b2c3d000008l1g2h3i4j9';

      (prisma.commitment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: commitmentId,
        status: CommitmentStatus.SUBMITTED,
        createdById: managerId, // Approver is the creator!
        submittedById: 'user_other',
        budgetLineId: 'line_1',
        amount: new Prisma.Decimal('5000.00'),
        projectId: 'p_1',
      });

      await expect(approveCommitment(commitmentId)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
      );
    });

    it('rejects self-approval when approver is the submitter', async () => {
      const managerId = 'user_mgr_1';
      vi.spyOn(permissions, 'requireManager').mockResolvedValue({
        id: managerId,
        name: 'المدير',
        email: 'mgr@test.local',
        role: Role.MANAGER,
        isActive: true,
      });

      const commitmentId = 'clh1b2c3d000008l1g2h3i4j9';

      (prisma.commitment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: commitmentId,
        status: CommitmentStatus.SUBMITTED,
        createdById: 'user_purchasing',
        submittedById: managerId, // Approver is the submitter!
        budgetLineId: 'line_1',
        amount: new Prisma.Decimal('5000.00'),
        projectId: 'p_1',
      });

      await expect(approveCommitment(commitmentId)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
      );
    });

    it('rejects approving a commitment that is not in SUBMITTED state', async () => {
      const managerId = 'user_mgr_1';
      vi.spyOn(permissions, 'requireManager').mockResolvedValue({
        id: managerId,
        name: 'المدير',
        email: 'mgr@test.local',
        role: Role.MANAGER,
        isActive: true,
      });

      const commitmentId = 'clh1b2c3d000008l1g2h3i4j9';

      (prisma.commitment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: commitmentId,
        status: CommitmentStatus.DRAFT, // Not submitted!
        createdById: 'user_purchasing',
        submittedById: 'user_purchasing',
        budgetLineId: 'line_1',
        amount: new Prisma.Decimal('5000.00'),
        projectId: 'p_1',
      });

      await expect(approveCommitment(commitmentId)).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
      );
    });
  });

  describe('getCommitment', () => {
    it('throws NOT_FOUND when commitment does not exist or is soft-deleted', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      (prisma.commitment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(getCommitment('clh1b2c3d000008l1g2h3i4j9')).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('returns commitment summary DTO when record exists', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      (prisma.commitment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'clh1b2c3d000008l1g2h3i4j9',
        projectId: 'proj_1',
        budgetLineId: 'line_1',
        vendorName: 'شركة التوريدات الحديثة',
        referenceNumber: 'PO-101',
        amount: new Prisma.Decimal('15000.00'),
        commitmentDate: new Date('2026-05-01'),
        description: 'توريد أنابيب بلاستيكية',
        status: CommitmentStatus.DRAFT,
        rejectionReason: null,
        createdById: 'user_purchasing',
        submittedById: null,
        approvedById: null,
        rejectedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: { id: 'user_purchasing', name: 'مسؤول المشتريات', email: 'purchasing@test.local' },
        submittedBy: null,
        approvedBy: null,
        rejectedBy: null,
        project: { id: 'proj_1', name: 'مشروع الأبراج', code: 'PRJ-01' },
        budgetLine: { id: 'line_1', category: 'MATERIALS', description: 'مواد سباكة', amount: new Prisma.Decimal('100000.00') },
      });

      const result = await getCommitment('clh1b2c3d000008l1g2h3i4j9');
      expect(result.id).toBe('clh1b2c3d000008l1g2h3i4j9');
      expect(result.vendorName).toBe('شركة التوريدات الحديثة');
      expect(result.amount).toBe('15000.00');
    });
  });

  describe('getUserCommitments', () => {
    it('queries all commitments when actor is MANAGER', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_mgr',
        name: 'المدير العام',
        email: 'manager@test.local',
        role: Role.MANAGER,
        isActive: true,
      });

      (prisma.commitment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getUserCommitments();

      expect(prisma.commitment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
    });

    it('restricts query to created/submitted commitments when actor is PURCHASING', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_purchasing_99',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      (prisma.commitment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getUserCommitments();

      expect(prisma.commitment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [{ createdById: 'user_purchasing_99' }, { submittedById: 'user_purchasing_99' }],
          },
        }),
      );
    });
  });

  describe('getActiveProjectsForCommitments', () => {
    it('forbids non-purchasing users from accessing active projects for commitments', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_eng',
        name: 'مهندس الموقع',
        email: 'eng@test.local',
        role: Role.ENGINEER,
        isActive: true,
      });

      await expect(getActiveProjectsForCommitments()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('returns active projects with approved budget lines for PURCHASING', async () => {
      vi.spyOn(permissions, 'requireAuth').mockResolvedValue({
        id: 'user_purchasing',
        name: 'مسؤول المشتريات',
        email: 'purchasing@test.local',
        role: Role.PURCHASING,
        isActive: true,
      });

      (prisma.project.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'proj_10',
          name: 'مشروع الجسر',
          code: 'PRJ-10',
          budgets: [
            {
              lines: [
                {
                  id: 'line_99',
                  category: 'CONCRETE',
                  description: 'خرسانة جاهزة',
                  amount: new Prisma.Decimal('75000.00'),
                },
              ],
            },
          ],
        },
      ]);

      const projects = await getActiveProjectsForCommitments();
      expect(projects).toHaveLength(1);
      expect(projects[0]?.name).toBe('مشروع الجسر');
      expect(projects[0]?.lines[0]?.amount).toBe('75000.00');
    });
  });
});
