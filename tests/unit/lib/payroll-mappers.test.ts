/**
 * tests/unit/lib/payroll-mappers.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 9: Mappers & DTO Finalization Unit Tests.
 *
 * Covers:
 * A. Decimal serialization to exact 2-decimal strings.
 * B. Date serialization.
 * C. Arabic period formatting (Intl Gregorian in Arabic).
 * D. Optional / null normalization.
 * E. Manager / Accountant canonical detail projection (PayrollDetailDTO).
 * F. Engineer aggregate projection (ProjectLaborSummaryDTO).
 * G. Absence of sensitive fields from Engineer DTO (Privacy boundary).
 * H. No raw Prisma properties / passwordHash / sessionToken leaks.
 * I. List DTO projection (PayrollListItemDTO).
 * J. Form DTO projection (PayrollFormDataDTO).
 */

import { describe, expect, it } from 'vitest';
import { BudgetCategory, PayrollStatus, Prisma } from '@prisma/client';

import {
  formatArabicPayrollPeriod,
  toPayrollDetailDTO,
  toPayrollListItemDTO,
  toProjectLaborSummaryDTO,
  toPayrollFormDataDTO,
  type PayrollEntryWithRelations,
  type RawPayrollFormDataProject,
  type RawProjectLaborSummaryInput,
} from '@/lib/payroll/mappers';

describe('Payroll Mappers & DTO Finalization Unit Tests', () => {
  // ---------------------------------------------------------------------------
  // C. Arabic Period Formatting
  // ---------------------------------------------------------------------------
  describe('formatArabicPayrollPeriod', () => {
    it('formats period to Arabic Gregorian month and year deterministically', () => {
      expect(formatArabicPayrollPeriod(2026, 9)).toBe('سبتمبر 2026');
      expect(formatArabicPayrollPeriod(2026, 1)).toBe('يناير 2026');
      expect(formatArabicPayrollPeriod(2026, 12)).toBe('ديسمبر 2026');
    });
  });

  // ---------------------------------------------------------------------------
  // E & A & B & D & H. toPayrollDetailDTO (Canonical Full Detail)
  // ---------------------------------------------------------------------------
  describe('toPayrollDetailDTO', () => {
    const fullMockEntry: PayrollEntryWithRelations = {
      id: 'cmu_pay_12345',
      projectId: 'cmu_prj_1',
      budgetLineId: 'cmu_bline_1',
      workerName: 'صالح محمد الغامدي',
      workerReference: 'REF-WRK-01',
      tradeOrTitle: 'فني كهرباء تمديدات',
      periodYear: 2026,
      periodMonth: 9,
      amount: new Prisma.Decimal('7500.00'),
      currency: 'SAR',
      description: 'أجور شهر سبتمبر 2026 شامل العمل الإضافي',
      status: PayrollStatus.APPROVED,
      createdById: 'usr_acc_1',
      submittedById: 'usr_acc_1',
      submittedAt: new Date('2026-09-10T08:00:00Z'),
      approvedById: 'usr_mgr_1',
      approvedAt: new Date('2026-09-11T14:00:00Z'),
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
      cancelledById: null,
      cancelledAt: null,
      cancellationReason: null,
      deletedAt: null,
      createdAt: new Date('2026-09-09T10:00:00Z'),
      updatedAt: new Date('2026-09-11T14:00:00Z'),
      project: {
        id: 'cmu_prj_1',
        name: 'مشروع إنشاء مستودعات الخرج',
        code: 'PRJ-WH-01',
      },
      budgetLine: {
        id: 'cmu_bline_1',
        category: BudgetCategory.LABOR,
        description: 'بند أجور وعمالة الأعمال الكهروميكانيكية',
        amount: new Prisma.Decimal('200000.00'),
      },
      createdBy: {
        id: 'usr_acc_1',
        name: 'محاسب المشروع',
        email: 'acc@test.local',
      },
      submittedBy: {
        id: 'usr_acc_1',
        name: 'محاسب المشروع',
        email: 'acc@test.local',
      },
      approvedBy: {
        id: 'usr_mgr_1',
        name: 'مدير العمليات',
        email: 'mgr@test.local',
      },
      rejectedBy: null,
      cancelledBy: null,
    };

    it('A & B. serializes amounts to exact 2-decimal strings and preserves valid dates', () => {
      const dto = toPayrollDetailDTO(fullMockEntry);

      expect(typeof dto.amount).toBe('string');
      expect(dto.amount).toBe('7500.00');
      expect(typeof dto.budgetLine?.amount).toBe('string');
      expect(dto.budgetLine?.amount).toBe('200000.00');

      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.submittedAt).toBeInstanceOf(Date);
      expect(dto.approvedAt).toBeInstanceOf(Date);
    });

    it('C. generates periodFormattedAr deterministically', () => {
      const dto = toPayrollDetailDTO(fullMockEntry);
      expect(dto.periodFormattedAr).toBe('سبتمبر 2026');
    });

    it('D. normalizes null and undefined fields consistently', () => {
      const minimalMockEntry: PayrollEntryWithRelations = {
        id: 'cmu_pay_minimal',
        projectId: 'cmu_prj_1',
        budgetLineId: 'cmu_bline_1',
        workerName: 'علي حسن',
        workerReference: null,
        tradeOrTitle: null,
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('3000.00'),
        currency: 'SAR',
        description: 'مسودة قيد',
        status: PayrollStatus.DRAFT,
        createdById: 'usr_acc_1',
        submittedById: null,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledById: null,
        cancelledAt: null,
        cancellationReason: null,
        deletedAt: null,
        createdAt: new Date('2026-09-09T10:00:00Z'),
        updatedAt: new Date('2026-09-09T10:00:00Z'),
        project: null,
        budgetLine: null,
        createdBy: null,
        submittedBy: null,
        approvedBy: null,
        rejectedBy: null,
        cancelledBy: null,
      };

      const dto = toPayrollDetailDTO(minimalMockEntry);

      expect(dto.workerReference).toBeNull();
      expect(dto.tradeOrTitle).toBeNull();
      expect(dto.submittedById).toBeNull();
      expect(dto.submittedBy).toBeNull();
      expect(dto.submittedAt).toBeNull();
      expect(dto.approvedById).toBeNull();
      expect(dto.approvedBy).toBeNull();
      expect(dto.approvedAt).toBeNull();
      expect(dto.rejectedById).toBeNull();
      expect(dto.rejectedBy).toBeNull();
      expect(dto.rejectedAt).toBeNull();
      expect(dto.rejectionReason).toBeNull();
      expect(dto.cancelledById).toBeNull();
      expect(dto.cancelledBy).toBeNull();
      expect(dto.cancelledAt).toBeNull();
      expect(dto.cancellationReason).toBeNull();
      expect(dto.deletedAt).toBeNull();

      expect(dto.project).toBeUndefined();
      expect(dto.budgetLine).toBeUndefined();
      expect(dto.createdBy).toBeUndefined();
    });

    it('H. never leaks internal ORM state, passwords, or session tokens', () => {
      const dto = toPayrollDetailDTO(fullMockEntry);
      const json = JSON.stringify(dto);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      expect('passwordHash' in parsed).toBe(false);
      expect('hashedPassword' in parsed).toBe(false);
      expect('sessionToken' in parsed).toBe(false);
      expect('session' in parsed).toBe(false);
      expect('_count' in parsed).toBe(false);
    });

    it('contains only approved fields in Manager/Accountant PayrollDetailDTO', () => {
      const dto = toPayrollDetailDTO(fullMockEntry);
      const allowedDetailKeys = new Set([
        'id',
        'projectId',
        'project',
        'budgetLineId',
        'budgetLine',
        'workerName',
        'workerReference',
        'tradeOrTitle',
        'periodYear',
        'periodMonth',
        'periodFormattedAr',
        'amount',
        'currency',
        'description',
        'status',
        'createdById',
        'createdBy',
        'submittedById',
        'submittedBy',
        'submittedAt',
        'approvedById',
        'approvedBy',
        'approvedAt',
        'rejectedById',
        'rejectedBy',
        'rejectedAt',
        'rejectionReason',
        'cancelledById',
        'cancelledBy',
        'cancelledAt',
        'cancellationReason',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ]);

      for (const key of Object.keys(dto)) {
        expect(allowedDetailKeys.has(key)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // I. toPayrollListItemDTO (Reduced List Projection)
  // ---------------------------------------------------------------------------
  describe('toPayrollListItemDTO', () => {
    it('maps only essential list fields and excludes granular tracking relations', () => {
      const mockEntry: PayrollEntryWithRelations = {
        id: 'cmu_pay_list_1',
        projectId: 'cmu_prj_1',
        budgetLineId: 'cmu_bline_1',
        workerName: 'خالد الزهراني',
        workerReference: 'REF-WRK-09',
        tradeOrTitle: 'مساعد نجار',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('4200.00'),
        currency: 'SAR',
        description: 'وصف تفصيلي لا يحتاجه جدول القائمة',
        status: PayrollStatus.SUBMITTED,
        createdById: 'usr_acc_1',
        submittedById: 'usr_acc_1',
        submittedAt: new Date(),
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledById: null,
        cancelledAt: null,
        cancellationReason: null,
        deletedAt: null,
        createdAt: new Date('2026-09-10T12:00:00Z'),
        updatedAt: new Date('2026-09-10T12:00:00Z'),
        project: {
          id: 'cmu_prj_1',
          name: 'مشروع المجمع الطبي',
          code: 'PRJ-MED-01',
        },
      };

      const listItem = toPayrollListItemDTO(mockEntry);

      // Verify presence of list fields
      expect(listItem.id).toBe('cmu_pay_list_1');
      expect(listItem.projectId).toBe('cmu_prj_1');
      expect(listItem.project?.name).toBe('مشروع المجمع الطبي');
      expect(listItem.workerName).toBe('خالد الزهراني');
      expect(listItem.workerReference).toBe('REF-WRK-09');
      expect(listItem.tradeOrTitle).toBe('مساعد نجار');
      expect(listItem.periodYear).toBe(2026);
      expect(listItem.periodMonth).toBe(9);
      expect(listItem.periodFormattedAr).toBe('سبتمبر 2026');
      expect(listItem.amount).toBe('4200.00');
      expect(listItem.currency).toBe('SAR');
      expect(listItem.status).toBe(PayrollStatus.SUBMITTED);
      expect(listItem.createdAt).toBeInstanceOf(Date);

      // Verify absence of heavy detail properties from list projection
      const rawObj = listItem as unknown as Record<string, unknown>;
      expect('description' in rawObj).toBe(false);
      expect('budgetLine' in rawObj).toBe(false);
      expect('createdBy' in rawObj).toBe(false);
      expect('submittedBy' in rawObj).toBe(false);
      expect('approvedBy' in rawObj).toBe(false);
      expect('rejectedBy' in rawObj).toBe(false);
      expect('cancelledBy' in rawObj).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // F & G. toProjectLaborSummaryDTO (Engineer DTO & Privacy)
  // ---------------------------------------------------------------------------
  describe('toProjectLaborSummaryDTO', () => {
    const rawInput: RawProjectLaborSummaryInput = {
      projectId: 'cmu_prj_77',
      projectName: 'مشروع برج اليمامة',
      projectCode: 'PRJ-YAM-01',
      totalLaborBudget: new Prisma.Decimal('1000000.00'),
      approvedLaborSpend: new Prisma.Decimal('650000.00'),
      pendingLaborSpend: new Prisma.Decimal('50000.00'),
      remainingLaborBudget: new Prisma.Decimal('350000.00'),
      currency: 'SAR',
      laborBudgetLinesCount: 3,
    };

    it('serializes all financial amounts to strings with 2 decimal places', () => {
      const summary = toProjectLaborSummaryDTO(rawInput);

      expect(summary.projectId).toBe('cmu_prj_77');
      expect(summary.projectName).toBe('مشروع برج اليمامة');
      expect(summary.projectCode).toBe('PRJ-YAM-01');
      expect(summary.totalLaborBudget).toBe('1000000.00');
      expect(summary.approvedLaborSpend).toBe('650000.00');
      expect(summary.pendingLaborSpend).toBe('50000.00');
      expect(summary.remainingLaborBudget).toBe('350000.00');
      expect(summary.currency).toBe('SAR');
      expect(summary.laborBudgetLinesCount).toBe(3);
    });

    it('accepts string monetary inputs without modifying valid precision', () => {
      const stringInput: RawProjectLaborSummaryInput = {
        projectId: 'cmu_prj_88',
        projectName: 'مشروع الطرق',
        projectCode: 'PRJ-RD-02',
        totalLaborBudget: '500000.50',
        approvedLaborSpend: '200000.25',
        pendingLaborSpend: '0.00',
        remainingLaborBudget: '300000.25',
      };

      const summary = toProjectLaborSummaryDTO(stringInput);
      expect(summary.totalLaborBudget).toBe('500000.50');
      expect(summary.approvedLaborSpend).toBe('200000.25');
      expect(summary.remainingLaborBudget).toBe('300000.25');
      expect(summary.currency).toBe('SAR');
      expect(summary.laborBudgetLinesCount).toBe(0);
    });

    it('G. STRUCTURAL PRIVACY GUARANTEE: absolutely no worker or individual row data leaks', () => {
      const summary = toProjectLaborSummaryDTO(rawInput);
      const serialized = JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;

      // Explicit field omission assertions (Prompt §19)
      expect('workerName' in serialized).toBe(false);
      expect('workerReference' in serialized).toBe(false);
      expect('tradeOrTitle' in serialized).toBe(false);
      expect('amount' in serialized).toBe(false); // Only totalLaborBudget / approvedLaborSpend
      expect('status' in serialized).toBe(false);
      expect('rejectionReason' in serialized).toBe(false);
      expect('cancellationReason' in serialized).toBe(false);
      expect('payrollId' in serialized).toBe(false);
      expect('id' in serialized).toBe(false);
      expect('createdById' in serialized).toBe(false);
      expect('approvedById' in serialized).toBe(false);
      expect('createdBy' in serialized).toBe(false);
      expect('approvedBy' in serialized).toBe(false);
      expect('payrollEntries' in serialized).toBe(false);
      expect('entries' in serialized).toBe(false);
      expect('rows' in serialized).toBe(false);

      // Verify exact authorized keys for Engineer ProjectLaborSummaryDTO
      const allowedKeys = new Set([
        'projectId',
        'projectName',
        'projectCode',
        'totalLaborBudget',
        'approvedLaborSpend',
        'pendingLaborSpend',
        'remainingLaborBudget',
        'currency',
        'laborBudgetLinesCount',
      ]);
      for (const key of Object.keys(serialized)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });

    it('asserts Purchasing role is strictly denied from accessing any Payroll DTO', async () => {
      const { policies } = await import('@/lib/permissions/policies');
      const purchasingActor = {
        id: 'usr_pur_1',
        role: 'PURCHASING' as const,
        isActive: true,
      };

      // Purchasing must receive NO payroll detail DTO
      expect(policies.canViewPayrollDetails(purchasingActor)).toBe(false);
      // Purchasing must receive NO labor summary DTO
      expect(policies.canViewProjectLaborAggregate(purchasingActor)).toBe(false);
      // Purchasing cannot create or approve payroll
      expect(policies.canCreatePayrollDraft(purchasingActor)).toBe(false);
      expect(
        policies.canApprovePayroll(purchasingActor, {
          createdById: 'acc_1',
          status: PayrollStatus.SUBMITTED,
        }),
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // J. toPayrollFormDataDTO (Form Supporting DTO)
  // ---------------------------------------------------------------------------
  describe('toPayrollFormDataDTO', () => {
    it('maps only approved LABOR lines and formats amounts to 2 decimals', () => {
      const rawProjects: RawPayrollFormDataProject[] = [
        {
          id: 'cmu_prj_1',
          name: 'مشروع المستشفى العام',
          code: 'PRJ-HOSP-01',
          budgets: [
            {
              lines: [
                {
                  id: 'line_labor_1',
                  description: 'أجور العمالة الأساسية',
                  amount: new Prisma.Decimal('120000.00'),
                  category: BudgetCategory.LABOR,
                },
                {
                  id: 'line_labor_2',
                  description: 'أجور عمالة التشطيبات',
                  amount: new Prisma.Decimal('80000.50'),
                  category: BudgetCategory.LABOR,
                },
              ],
            },
          ],
        },
      ];

      const formData = toPayrollFormDataDTO(rawProjects);

      expect(formData.projects).toHaveLength(1);
      const p = formData.projects[0]!;
      expect(p.id).toBe('cmu_prj_1');
      expect(p.name).toBe('مشروع المستشفى العام');
      expect(p.code).toBe('PRJ-HOSP-01');
      expect(p.laborLines).toHaveLength(2);

      expect(p.laborLines[0]).toEqual({
        id: 'line_labor_1',
        description: 'أجور العمالة الأساسية',
        amount: '120000.00',
        category: BudgetCategory.LABOR,
      });

      expect(p.laborLines[1]).toEqual({
        id: 'line_labor_2',
        description: 'أجور عمالة التشطيبات',
        amount: '80000.50',
        category: BudgetCategory.LABOR,
      });

      // Assert no worker or salary history properties exist on form DTO
      const serialized = JSON.parse(JSON.stringify(formData)) as Record<string, unknown>;
      expect('workers' in serialized).toBe(false);
      expect('salaries' in serialized).toBe(false);
      expect('history' in serialized).toBe(false);
    });
  });
});
