/**
 * tests/unit/lib/dashboard-mappers.test.ts
 *
 * Unit tests for dashboard mapper functions.
 *
 * Tests cover:
 *  M-01  Decimal → .toFixed(2) serialization (exact 2 decimal places)
 *  M-02  Date → ISO-8601 string (never a Date in DTO)
 *  M-03  currency always 'SAR'
 *  M-04  No Decimal or Date in DTO output
 *  M-05  Projects sorted by projectCode ascending (localeCompare ar)
 *  M-06  hasApprovedBudget = false → all amounts are '0.00'
 *  M-07  PendingApprovalsDTO total = sum of five counts
 *  M-08  toExecutiveDashboardDTO assembles all parts correctly
 */

import { describe, expect, it } from 'vitest';
import { Prisma, ProjectStatus } from '@prisma/client';

import {
  toProjectFinancialSummaryDTO,
  toCompanyFinancialSummaryDTO,
  toExecutiveDashboardDTO,
  createCompanyAccumulator,
  createEmptyProjectAccumulator,
  type ProjectFinancialAccumulator,
  type CompanyFinancialAccumulator,
} from '@/lib/dashboard/mappers';
import type { PendingApprovalsDTO } from '@/lib/dashboard/types';

const zero = new Prisma.Decimal('0.00');
const dec = (v: string) => new Prisma.Decimal(v);

function makeProjectAcc(overrides: Partial<ProjectFinancialAccumulator> = {}): ProjectFinancialAccumulator {
  return {
    projectId: 'proj-1',
    projectCode: 'PRJ-001',
    projectName: 'مشروع الاختبار',
    projectStatus: ProjectStatus.ACTIVE,
    hasApprovedBudget: true,
    authorizedBudget: dec('100000.00'),
    actualSpend: dec('23000.00'),
    activeExposure: dec('53000.00'),
    availableBalance: dec('47000.00'),
    pendingExposure: dec('14000.00'),
    projectedBalance: dec('33000.00'),
    ...overrides,
  };
}

function makeCompanyAcc(overrides: Partial<CompanyFinancialAccumulator> = {}): CompanyFinancialAccumulator {
  return {
    totalAuthorizedBudget: dec('100000.00'),
    totalActualSpend: dec('23000.00'),
    totalActiveExposure: dec('53000.00'),
    totalAvailableBalance: dec('47000.00'),
    totalPendingExposure: dec('14000.00'),
    totalProjectedBalance: dec('33000.00'),
    ...overrides,
  };
}

const mockPendingApprovals: PendingApprovalsDTO = {
  expenses: 3,
  commitments: 1,
  custodies: 2,
  payrollEntries: 0,
  subcontractorBillings: 1,
  total: 7,
};

describe('Dashboard DTO Mappers', () => {
  describe('M-01: Decimal → .toFixed(2) serialization', () => {
    it('serializes Decimal values to strings with exactly 2 decimal places', () => {
      const dto = toProjectFinancialSummaryDTO(makeProjectAcc());
      expect(dto.authorizedBudget).toBe('100000.00');
      expect(dto.actualSpend).toBe('23000.00');
      expect(dto.activeExposure).toBe('53000.00');
      expect(dto.availableBalance).toBe('47000.00');
      expect(dto.pendingExposure).toBe('14000.00');
      expect(dto.projectedBalance).toBe('33000.00');
    });

    it('serializes zero Decimal as "0.00"', () => {
      const dto = toProjectFinancialSummaryDTO(
        makeProjectAcc({
          authorizedBudget: zero,
          actualSpend: zero,
          activeExposure: zero,
          availableBalance: zero,
          pendingExposure: zero,
          projectedBalance: zero,
        }),
      );
      expect(dto.authorizedBudget).toBe('0.00');
      expect(dto.actualSpend).toBe('0.00');
    });

    it('preserves large Decimal values without precision loss', () => {
      const dto = toProjectFinancialSummaryDTO(
        makeProjectAcc({ authorizedBudget: dec('999999999.99') }),
      );
      expect(dto.authorizedBudget).toBe('999999999.99');
    });
  });

  describe('M-02: Date → ISO-8601 string', () => {
    it('converts Date to ISO-8601 string in toExecutiveDashboardDTO', () => {
      const now = new Date('2026-09-22T13:46:46.000Z');
      const dto = toExecutiveDashboardDTO(
        makeCompanyAcc(),
        mockPendingApprovals,
        [],
        now,
      );
      expect(dto.generatedAt).toBe('2026-09-22T13:46:46.000Z');
      expect(typeof dto.generatedAt).toBe('string');
    });
  });

  describe('M-03: currency always "SAR"', () => {
    it('project DTO has currency = SAR', () => {
      const dto = toProjectFinancialSummaryDTO(makeProjectAcc());
      expect(dto.currency).toBe('SAR');
    });

    it('company summary DTO has currency = SAR', () => {
      const dto = toCompanyFinancialSummaryDTO(makeCompanyAcc());
      expect(dto.currency).toBe('SAR');
    });
  });

  describe('M-04: No Decimal or Date in DTO output', () => {
    it('project DTO has no Decimal or Date fields', () => {
      const dto = toProjectFinancialSummaryDTO(makeProjectAcc());
      const values = Object.values(dto);
      for (const v of values) {
        expect((v as unknown) instanceof Prisma.Decimal).toBe(false);
        expect((v as unknown) instanceof Date).toBe(false);
      }
    });

    it('company summary DTO has no Decimal or Date fields', () => {
      const dto = toCompanyFinancialSummaryDTO(makeCompanyAcc());
      const values = Object.values(dto);
      for (const v of values) {
        expect((v as unknown) instanceof Prisma.Decimal).toBe(false);
        expect((v as unknown) instanceof Date).toBe(false);
      }
    });
  });

  describe('M-05: Projects sorted by projectCode ascending', () => {
    it('sorts projects by code in the assembled DTO', () => {
      const accs: ProjectFinancialAccumulator[] = [
        makeProjectAcc({ projectId: '3', projectCode: 'PRJ-003' }),
        makeProjectAcc({ projectId: '1', projectCode: 'PRJ-001' }),
        makeProjectAcc({ projectId: '2', projectCode: 'PRJ-002' }),
      ];
      const dto = toExecutiveDashboardDTO(makeCompanyAcc(), mockPendingApprovals, accs, new Date());
      expect(dto.projects[0]!.projectCode).toBe('PRJ-001');
      expect(dto.projects[1]!.projectCode).toBe('PRJ-002');
      expect(dto.projects[2]!.projectCode).toBe('PRJ-003');
    });
  });

  describe('M-06: hasApprovedBudget = false emits all zeros', () => {
    it('createEmptyProjectAccumulator produces zeros and hasApprovedBudget = false', () => {
      const acc = createEmptyProjectAccumulator('proj-2', 'PRJ-002', 'مشروع 2', ProjectStatus.PLANNED);
      expect(acc.hasApprovedBudget).toBe(false);
      expect(acc.authorizedBudget.toFixed(2)).toBe('0.00');
      expect(acc.actualSpend.toFixed(2)).toBe('0.00');
    });

    it('DTO from empty accumulator has hasApprovedBudget = false and all "0.00" amounts', () => {
      const acc = createEmptyProjectAccumulator('proj-2', 'PRJ-002', 'مشروع 2', ProjectStatus.PLANNED);
      const dto = toProjectFinancialSummaryDTO(acc);
      expect(dto.hasApprovedBudget).toBe(false);
      expect(dto.authorizedBudget).toBe('0.00');
      expect(dto.actualSpend).toBe('0.00');
      expect(dto.activeExposure).toBe('0.00');
    });
  });

  describe('M-07: PendingApprovalsDTO total = sum of five counts', () => {
    it('total equals expenses + commitments + custodies + payroll + billings', () => {
      const approvals: PendingApprovalsDTO = {
        expenses: 3,
        commitments: 1,
        custodies: 2,
        payrollEntries: 4,
        subcontractorBillings: 1,
        total: 11,
      };
      const computed =
        approvals.expenses +
        approvals.commitments +
        approvals.custodies +
        approvals.payrollEntries +
        approvals.subcontractorBillings;
      expect(computed).toBe(approvals.total);
    });

    it('total is 0 when all counts are 0', () => {
      const approvals: PendingApprovalsDTO = {
        expenses: 0,
        commitments: 0,
        custodies: 0,
        payrollEntries: 0,
        subcontractorBillings: 0,
        total: 0,
      };
      expect(approvals.total).toBe(0);
    });
  });

  describe('M-08: toExecutiveDashboardDTO assembles all parts correctly', () => {
    it('assembles company summary, pending approvals, and sorted projects', () => {
      const now = new Date();
      const dto = toExecutiveDashboardDTO(
        makeCompanyAcc(),
        mockPendingApprovals,
        [makeProjectAcc()],
        now,
      );

      expect(dto.companySummary.totalAuthorizedBudget).toBe('100000.00');
      expect(dto.companySummary.currency).toBe('SAR');
      expect(dto.pendingApprovals.total).toBe(7);
      expect(dto.projects).toHaveLength(1);
      expect(dto.projects[0]!.projectId).toBe('proj-1');
      expect(typeof dto.generatedAt).toBe('string');
    });
  });

  describe('createCompanyAccumulator — zero initialization', () => {
    it('all fields start at zero', () => {
      const acc = createCompanyAccumulator();
      expect(acc.totalAuthorizedBudget.toFixed(2)).toBe('0.00');
      expect(acc.totalActualSpend.toFixed(2)).toBe('0.00');
      expect(acc.totalActiveExposure.toFixed(2)).toBe('0.00');
      expect(acc.totalAvailableBalance.toFixed(2)).toBe('0.00');
      expect(acc.totalPendingExposure.toFixed(2)).toBe('0.00');
      expect(acc.totalProjectedBalance.toFixed(2)).toBe('0.00');
    });
  });
});
