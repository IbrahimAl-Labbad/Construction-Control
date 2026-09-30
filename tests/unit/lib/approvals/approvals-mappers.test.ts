import { describe, it, expect } from 'vitest';
import {
  toExpenseApprovalItemDTO,
  toCommitmentApprovalItemDTO,
  toCustodyApprovalItemDTO,
  toPayrollApprovalItemDTO,
  toBillingApprovalItemDTO,
} from '@/lib/approvals/mappers';

describe('Approvals Mappers (Unit)', () => {
  it('maps expense correctly: submittedBy.name -> initiatorName, detailsHref = /projects/:id/expenses', () => {
    const raw = {
      id: 'exp-1',
      projectId: 'proj-1',
      project: { code: 'PRJ-001', name: 'برج الأمل' },
      budgetLine: { category: 'CONCRETE', description: 'خرسانة مسلحة' },
      amount: { toFixed: () => '12500.50' },
      currency: 'SAR',
      description: 'شراء حديد',
      expenseDate: new Date('2026-09-01T00:00:00.000Z'),
      status: 'SUBMITTED',
      submittedBy: { name: 'المهندس أحمد' },
      submittedAt: new Date('2026-09-02T10:00:00.000Z'),
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      custody: { code: 'CUST-001' },
    };

    const dto = toExpenseApprovalItemDTO(raw);

    expect(dto.id).toBe('exp-1');
    expect(dto.domain).toBe('EXPENSE');
    expect(dto.status).toBe('SUBMITTED');
    expect(dto.initiatorName).toBe('المهندس أحمد');
    expect(dto.amount).toBe('12500.50');
    expect(dto.currency).toBe('SAR');
    expect(dto.detailsHref).toBe('/projects/proj-1/expenses');
    expect(dto.custodyCode).toBe('CUST-001');
    expect(dto.expenseDate).toBe('2026-09-01');
    expect(dto.submittedAt).toBe('2026-09-02T10:00:00.000Z');
    expect(dto.createdAt).toBe('2026-09-01T08:00:00.000Z');
  });

  it('maps commitment correctly: createdBy.name -> initiatorName, submittedBy.name -> submitterName, detailsHref = /projects/:id/commitments', () => {
    const raw = {
      id: 'com-1',
      projectId: 'proj-2',
      project: { code: 'PRJ-002', name: 'مستشفى السلام' },
      budgetLine: { category: 'PLUMBING', description: 'تمديدات صحية' },
      amount: { toFixed: () => '45000.00' },
      currency: 'SAR',
      vendorName: 'شركة السباكة الحديثة',
      referenceNumber: 'PO-2026-99',
      commitmentDate: new Date('2026-09-05T00:00:00.000Z'),
      description: 'توريد مواسير',
      status: 'SUBMITTED',
      createdBy: { name: 'مسؤول المشتريات فهد' },
      submittedBy: { name: 'المراجع سعود' },
      submittedAt: new Date('2026-09-06T12:00:00.000Z'),
      createdAt: new Date('2026-09-05T09:00:00.000Z'),
    };

    const dto = toCommitmentApprovalItemDTO(raw);

    expect(dto.id).toBe('com-1');
    expect(dto.domain).toBe('COMMITMENT');
    expect(dto.initiatorName).toBe('مسؤول المشتريات فهد');
    expect(dto.submitterName).toBe('المراجع سعود');
    expect(dto.amount).toBe('45000.00');
    expect(dto.detailsHref).toBe('/projects/proj-2/commitments');
    expect(dto.vendorName).toBe('شركة السباكة الحديثة');
    expect(dto.referenceNumber).toBe('PO-2026-99');
    expect(dto.commitmentDate).toBe('2026-09-05');
  });

  it('maps custody correctly: createdBy.name -> initiatorName, custodian.name -> custodianName, detailsHref = /projects/:id/custodies', () => {
    const raw = {
      id: 'cust-1',
      code: 'CS-005',
      projectId: 'proj-3',
      project: { code: 'PRJ-003', name: 'طريق النور' },
      budgetLine: { category: 'SITE_OPS', description: 'مصاريف موقع' },
      amount: { toFixed: () => '5000.00' },
      currency: 'SAR',
      purpose: 'نثريات طارئة',
      status: 'SUBMITTED',
      createdBy: { name: 'المحاسب عمر' },
      custodian: { name: 'المهندس ياسر' },
      expectedSettlementDate: new Date('2026-09-30T00:00:00.000Z'),
      submittedAt: new Date('2026-09-10T14:00:00.000Z'),
      createdAt: new Date('2026-09-10T11:00:00.000Z'),
    };

    const dto = toCustodyApprovalItemDTO(raw);

    expect(dto.id).toBe('cust-1');
    expect(dto.domain).toBe('CUSTODY');
    expect(dto.code).toBe('CS-005');
    expect(dto.initiatorName).toBe('المحاسب عمر');
    expect(dto.custodianName).toBe('المهندس ياسر');
    expect(dto.amount).toBe('5000.00');
    expect(dto.detailsHref).toBe('/projects/proj-3/custodies');
    expect(dto.expectedSettlementDate).toBe('2026-09-30');
  });

  it('maps payroll correctly: createdBy.name -> initiatorName, detailsHref = /payroll/:id', () => {
    const raw = {
      id: 'pay-1',
      projectId: 'proj-4',
      project: { code: 'PRJ-004', name: 'مدرسة التفوق' },
      budgetLine: { category: 'LABOR', description: 'أجور عمالة مباشرة' },
      amount: { toFixed: () => '3200.00' },
      currency: 'SAR',
      workerName: 'علي بن مسعود',
      tradeOrTitle: 'نجار مسلح',
      periodYear: 2026,
      periodMonth: 9,
      description: 'أجر شهر سبتمبر',
      status: 'SUBMITTED',
      createdBy: { name: 'محاسب الرواتب' },
      submittedAt: new Date('2026-09-15T08:00:00.000Z'),
      createdAt: new Date('2026-09-15T07:30:00.000Z'),
    };

    const dto = toPayrollApprovalItemDTO(raw);

    expect(dto.id).toBe('pay-1');
    expect(dto.domain).toBe('PAYROLL');
    expect(dto.initiatorName).toBe('محاسب الرواتب');
    expect(dto.amount).toBe('3200.00');
    expect(dto.detailsHref).toBe('/payroll/pay-1');
    expect(dto.workerName).toBe('علي بن مسعود');
    expect(dto.tradeOrTitle).toBe('نجار مسلح');
    expect(dto.periodYear).toBe(2026);
    expect(dto.periodMonth).toBe(9);
  });

  it('maps billing correctly: createdBy.name -> initiatorName, grossAmount -> amount, detailsHref = /subcontractor-billings/:id', () => {
    const raw = {
      id: 'bill-1',
      projectId: 'proj-5',
      project: { code: 'PRJ-005', name: 'مجمع تجاري' },
      budgetLine: { category: 'HVAC', description: 'تكييف وتهوية' },
      grossAmount: { toFixed: () => '88000.75' },
      currency: 'SAR',
      subcontractorName: 'شركة التبريد المتقدم',
      referenceNumber: 'SUB-INV-01',
      billingPeriod: '2026-08',
      claimDate: new Date('2026-09-01T00:00:00.000Z'),
      status: 'SUBMITTED',
      createdBy: { name: 'مهندس العقود' },
      commitment: {
        referenceNumber: 'COM-HVAC-01',
        amount: { toFixed: () => '150000.00' },
      },
      submittedAt: new Date('2026-09-02T16:00:00.000Z'),
      createdAt: new Date('2026-09-02T15:00:00.000Z'),
    };

    const dto = toBillingApprovalItemDTO(raw);

    expect(dto.id).toBe('bill-1');
    expect(dto.domain).toBe('SUBCONTRACTOR_BILLING');
    expect(dto.initiatorName).toBe('مهندس العقود');
    expect(dto.amount).toBe('88000.75');
    expect(dto.detailsHref).toBe('/subcontractor-billings/bill-1');
    expect(dto.subcontractorName).toBe('شركة التبريد المتقدم');
    expect(dto.referenceNumber).toBe('SUB-INV-01');
    expect(dto.commitmentReference).toBe('COM-HVAC-01');
    expect(dto.commitmentAmount).toBe('150000.00');
  });

  it('serializes all timestamps and dates as strings, with no Date instances in DTO output', () => {
    const raw = {
      id: 'exp-2',
      projectId: 'proj-1',
      project: { code: 'PRJ-001', name: 'برج الأمل' },
      budgetLine: { category: 'CONCRETE', description: 'خرسانة' },
      amount: '500.00',
      currency: 'SAR',
      description: 'مصروف وقود',
      expenseDate: new Date('2026-09-03'),
      status: 'SUBMITTED',
      submittedBy: { name: 'سائق المعدات' },
      submittedAt: new Date('2026-09-03T10:00:00Z'),
      createdAt: new Date('2026-09-03T09:00:00Z'),
      custody: null,
    };

    const dto = toExpenseApprovalItemDTO(raw);

    expect(typeof dto.createdAt).toBe('string');
    expect(typeof dto.submittedAt).toBe('string');
    expect(typeof dto.expenseDate).toBe('string');
    expect(typeof dto.amount).toBe('string');
    expect(dto.custodyCode).toBeNull();
  });
});
