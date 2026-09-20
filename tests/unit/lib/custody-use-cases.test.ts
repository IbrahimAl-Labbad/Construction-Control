/**
 * tests/unit/lib/custody-use-cases.test.ts
 *
 * Unit tests for Custody use cases:
 * - Role authorization (Engineer/Accountant create; Manager approves/cancels/closes; Accountant issues/returns)
 * - Separation of duties (Manager cannot approve their own custody)
 * - Invariant 8 (Active custody uniqueness per custodian/project)
 * - Pre-issuance cancellation (APPROVED -> CANCELLED allowed; ISSUED -> CANCELLED rejected)
 * - Hard cap gate check during ISSUANCE (Accountant issuance checks BudgetLine ceiling)
 * - Cash return limits and auto-settlement
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, ProjectStatus, CustodyStatus, BudgetCategory, BudgetStatus, Prisma } from '@prisma/client';

import * as permissions from '@/lib/permissions';
import { prisma } from '@/lib/db/prisma';
import {
  createCustodyDraft,
  approveCustody,
  cancelCustody,
  issueCustody,
  recordCashReturn,
  closeCustody,
} from '@/lib/custodies';
import type { AuthenticatedUser } from '@/lib/auth/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    project: { findFirst: vi.fn(), findMany: vi.fn() },
    budget: { findFirst: vi.fn() },
    budgetLine: { findFirst: vi.fn() },
    custody: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findFirst: vi.fn() },
    expense: {
      aggregate: vi.fn(),
    },
    commitment: {
      aggregate: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

type MockTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

describe('Custody Use Cases (Unit Tests)', () => {
  const CUID_PROJECT = 'clh1b2c3d000008l1g2h3i4j1';
  const CUID_BUDGET_LINE = 'clh1b2c3d000008l1g2h3i4j2';
  const CUID_CUSTODY = 'clh1b2c3d000008l1g2h3i4j5';
  const CUID_ENGINEER = 'clh1b2c3d000008l1g2h3i4e1';
  const CUID_ACCOUNTANT = 'clh1b2c3d000008l1g2h3i4a1';
  const CUID_MANAGER = 'clh1b2c3d000008l1g2h3i4m1';

  const mockEngineer: AuthenticatedUser = {
    id: CUID_ENGINEER,
    name: 'مهندس الموقع',
    email: 'eng@test.local',
    role: Role.ENGINEER,
    isActive: true,
  };

  const mockAccountant: AuthenticatedUser = {
    id: CUID_ACCOUNTANT,
    name: 'المحاسب المالي',
    email: 'acc@test.local',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const mockManager: AuthenticatedUser = {
    id: CUID_MANAGER,
    name: 'المدير العام',
    email: 'mgr@test.local',
    role: Role.MANAGER,
    isActive: true,
  };

  const mockProject = {
    id: CUID_PROJECT,
    status: ProjectStatus.ACTIVE,
    code: 'PRJ-01',
    name: 'مشروع أ',
    deletedAt: null,
  };

  const mockBudget = {
    id: 'b_123',
    projectId: mockProject.id,
    status: BudgetStatus.APPROVED,
    deletedAt: null,
  };

  const mockLine = {
    id: CUID_BUDGET_LINE,
    budgetId: mockBudget.id,
    category: BudgetCategory.SITE_OPERATIONS,
    description: 'مصاريف موقع',
    amount: new Prisma.Decimal('50000.00'),
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustodyDraft - Role Authorization & Invariant 8', () => {
    it('allows ENGINEER to create custody draft', async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(mockEngineer);

      const mockCreated = {
        id: CUID_CUSTODY,
        code: 'CUST-001',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        custodianUserId: mockEngineer.id,
        amount: new Prisma.Decimal('5000.00'),
        currency: 'SAR',
        purpose: 'شراء لوازم تشغيلية ووقود للموقع',
        status: CustodyStatus.DRAFT,
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        createdById: mockEngineer.id,
        createdBy: mockEngineer,
        custodian: mockEngineer,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          project: { findFirst: vi.fn().mockResolvedValue(mockProject) },
          budget: { findFirst: vi.fn().mockResolvedValue(mockBudget) },
          budgetLine: { findFirst: vi.fn().mockResolvedValue(mockLine) },
          user: { findFirst: vi.fn().mockResolvedValue({ id: mockEngineer.id, role: Role.ENGINEER, isActive: true, deletedAt: null }) },
          custody: {
            findFirst: vi.fn().mockResolvedValue(null), // Invariant 8 check: none
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(mockCreated),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ code: 'CUST-000' }]),
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await createCustodyDraft({
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        custodianUserId: mockEngineer.id,
        amount: '5000.00',
        purpose: 'شراء لوازم تشغيلية ووقود للموقع',
      });

      expect(result.id).toBe(CUID_CUSTODY);
      expect(result.status).toBe(CustodyStatus.DRAFT);
    });

    it('rejects PURCHASING role from creating custody draft', async () => {
      vi.spyOn(permissions, 'requireRole').mockRejectedValue(
        new permissions.PermissionError('FORBIDDEN', [Role.ENGINEER, Role.ACCOUNTANT], Role.PURCHASING),
      );

      await expect(
        createCustodyDraft({
          projectId: mockProject.id,
          budgetLineId: mockLine.id,
          custodianUserId: mockEngineer.id,
          amount: '5000.00',
          purpose: 'شراء لوازم تشغيلية ووقود للموقع',
        }),
      ).rejects.toThrow(permissions.PermissionError);
    });

    it('enforces Invariant 8: rejects creation if custodian already has an active custody on the project', async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(mockEngineer);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          project: { findFirst: vi.fn().mockResolvedValue(mockProject) },
          budget: { findFirst: vi.fn().mockResolvedValue(mockBudget) },
          budgetLine: { findFirst: vi.fn().mockResolvedValue(mockLine) },
          user: { findFirst: vi.fn().mockResolvedValue({ id: mockEngineer.id, role: Role.ENGINEER, isActive: true, deletedAt: null }) },
          custody: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'existing_active_custody',
              code: 'CUST-000',
              status: CustodyStatus.ISSUED,
            }),
          },
        };
        return cb(tx as unknown as MockTx);
      });

      await expect(
        createCustodyDraft({
          projectId: mockProject.id,
          budgetLineId: mockLine.id,
          custodianUserId: mockEngineer.id,
          amount: '5000.00',
          purpose: 'شراء لوازم تشغيلية ووقود للموقع',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'ACTIVE_CUSTODY_EXISTS' }),
      );
    });
  });

  describe('approveCustody - Separation of Duties & Invariant 2', () => {
    it('prevents Manager from self-approving a custody where Manager is custodian', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue({
        id: CUID_CUSTODY,
        code: 'CUST-002',
        status: CustodyStatus.SUBMITTED,
        createdById: CUID_ENGINEER,
        custodianUserId: mockManager.id, // Manager is the custodian!
        budgetLineId: mockLine.id,
        amount: new Prisma.Decimal('3000.00'),
        projectId: mockProject.id,
      } as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      await expect(approveCustody(CUID_CUSTODY)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
      );
    });
  });

  describe('cancelCustody - Pre-Issuance Cancellation Rule', () => {
    it('allows Manager to cancel an APPROVED custody before issuance', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const approvedCustody = {
        id: CUID_CUSTODY,
        code: 'CUST-003',
        status: CustodyStatus.APPROVED,
        amount: new Prisma.Decimal('4000.00'),
        projectId: mockProject.id,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(approvedCustody as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          custody: {
            update: vi.fn().mockResolvedValue({
              ...approvedCustody,
              status: CustodyStatus.CANCELLED,
              cancellationReason: 'إلغاء النشاط الميداني قبل الصرف',
              cancelledById: mockManager.id,
              cancelledAt: new Date(),
              createdBy: mockEngineer,
              custodian: mockEngineer,
              cashReturnedAmount: new Prisma.Decimal('0.00'),
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await cancelCustody({
        id: CUID_CUSTODY,
        cancellationReason: 'إلغاء النشاط الميداني قبل الصرف',
      });

      expect(result.status).toBe(CustodyStatus.CANCELLED);
    });

    it('strictly forbids cancelling an already ISSUED custody', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const issuedCustody = {
        id: CUID_CUSTODY,
        code: 'CUST-004',
        status: CustodyStatus.ISSUED, // Already issued!
        amount: new Prisma.Decimal('4000.00'),
        projectId: mockProject.id,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(issuedCustody as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      await expect(
        cancelCustody({
          id: CUID_CUSTODY,
          cancellationReason: 'محاولة إلغاء عهدة بعد صرف مبالغها',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'CANNOT_CANCEL_ISSUED_CUSTODY' }),
      );
    });
  });

  describe('issueCustody - Role Authorization & Hard Cap Gate Check', () => {
    it('allows ACCOUNTANT to issue custody when within budget line ceiling', async () => {
      vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(mockAccountant);

      const approvedCustody = {
        id: CUID_CUSTODY,
        code: 'CUST-005',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        amount: new Prisma.Decimal('10000.00'),
        status: CustodyStatus.APPROVED,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(approvedCustody as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          $queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray) => {
            const queryStr = Array.isArray(strings) ? strings.join(' ') : String(strings);
            if (queryStr.includes('budget_lines')) {
              return [{ id: mockLine.id, amount: new Prisma.Decimal('50000.00') }];
            }
            if (queryStr.includes('custodies')) {
              return [approvedCustody];
            }
            return [];
          }),
          project: {
            findFirst: vi.fn().mockResolvedValue({ status: ProjectStatus.ACTIVE }),
          },
          budget: {
            findFirst: vi.fn().mockResolvedValue({ id: 'b_123' }),
          },
          expense: {
            aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('5000.00') } }),
          },
          commitment: {
            aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('10000.00') } }),
          },
          custody: {
            findMany: vi.fn().mockResolvedValue([]), // No other active custodies
            update: vi.fn().mockResolvedValue({
              ...approvedCustody,
              status: CustodyStatus.ISSUED,
              issuedById: mockAccountant.id,
              issuedAt: new Date(),
              createdBy: mockEngineer,
              custodian: mockEngineer,
              cashReturnedAmount: new Prisma.Decimal('0.00'),
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await issueCustody(CUID_CUSTODY);
      expect(result.status).toBe(CustodyStatus.ISSUED);
    });

    it('throws BUDGET_LINE_EXCEEDED when custody amount exceeds available budget line ceiling', async () => {
      vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(mockAccountant);

      const largeCustody = {
        id: CUID_CUSTODY,
        code: 'CUST-006',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        amount: new Prisma.Decimal('45000.00'), // 45k + 10k existing = 55k > 50k ceiling!
        status: CustodyStatus.APPROVED,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(largeCustody as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          $queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray) => {
            const queryStr = Array.isArray(strings) ? strings.join(' ') : String(strings);
            if (queryStr.includes('budget_lines')) {
              return [{ id: mockLine.id, amount: new Prisma.Decimal('50000.00') }];
            }
            if (queryStr.includes('custodies')) {
              return [largeCustody];
            }
            return [];
          }),
          project: {
            findFirst: vi.fn().mockResolvedValue({ status: ProjectStatus.ACTIVE }),
          },
          budget: {
            findFirst: vi.fn().mockResolvedValue({ id: 'b_123' }),
          },
          expense: {
            aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('10000.00') } }),
          },
          commitment: {
            aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('0.00') } }),
          },
          custody: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        };
        return cb(tx as unknown as MockTx);
      });

      await expect(issueCustody(CUID_CUSTODY)).rejects.toThrow(
        expect.objectContaining({ code: 'BUDGET_LINE_EXCEEDED' }),
      );
    });
  });

  describe('recordCashReturn - Balance Limits & Auto-Settlement', () => {
    it('throws CASH_RETURN_EXCEEDS_BALANCE if return amount is greater than remaining balance', async () => {
      vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(mockAccountant);

      const custodyRecord = {
        id: CUID_CUSTODY,
        code: 'CUST-007',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        amount: new Prisma.Decimal('5000.00'),
        cashReturnedAmount: new Prisma.Decimal('0.00'),
        status: CustodyStatus.PARTIALLY_SETTLED,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(custodyRecord as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          $queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray) => {
            const queryStr = Array.isArray(strings) ? strings.join(' ') : String(strings);
            if (queryStr.includes('budget_lines')) {
              return [{ id: mockLine.id, amount: mockLine.amount }];
            }
            if (queryStr.includes('custodies')) {
              return [custodyRecord];
            }
            return [];
          }),
          expense: {
            aggregate: vi.fn().mockResolvedValue({
              _sum: { amount: new Prisma.Decimal('4500.00') }, // 4.5k spent -> 500 remaining
            }),
          },
        };
        return cb(tx as unknown as MockTx);
      });

      // Trying to return 600.00 when only 500.00 is remaining
      await expect(
        recordCashReturn({
          id: CUID_CUSTODY,
          amount: '600.00',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'CASH_RETURN_EXCEEDS_BALANCE' }),
      );
    });
  });

  describe('closeCustody - Manager Final Closure', () => {
    it('allows Manager to close SETTLED custody with zero remaining balance', async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(mockManager);

      const settledCustody = {
        id: CUID_CUSTODY,
        code: 'CUST-008',
        projectId: mockProject.id,
        budgetLineId: mockLine.id,
        amount: new Prisma.Decimal('5000.00'),
        cashReturnedAmount: new Prisma.Decimal('1000.00'),
        status: CustodyStatus.SETTLED,
        deletedAt: null,
      };

      vi.spyOn(prisma.custody, 'findFirst').mockResolvedValue(settledCustody as unknown as Awaited<ReturnType<typeof prisma.custody.findFirst>>);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([settledCustody]),
          expense: {
            aggregate: vi.fn().mockResolvedValue({
              _sum: { amount: new Prisma.Decimal('4000.00') }, // 4000 + 1000 = 5000 -> 0 remaining
            }),
          },
          custody: {
            update: vi.fn().mockResolvedValue({
              ...settledCustody,
              status: CustodyStatus.CLOSED,
              closedById: mockManager.id,
              closedAt: new Date(),
              createdBy: mockEngineer,
              custodian: mockEngineer,
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx as unknown as MockTx);
      });

      const result = await closeCustody(CUID_CUSTODY);
      expect(result.status).toBe(CustodyStatus.CLOSED);
    });
  });
});
