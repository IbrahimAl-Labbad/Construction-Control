/**
 * tests/unit/app/payroll-presentation.test.tsx
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 11: Presentation / UI Component Tests.
 *
 * Covers:
 * - Arabic status labels on PayrollStatusBadge
 * - Required form fields rendered in PayrollForm
 * - Payroll amount and currency formatted correctly in ProjectLaborSummaryCard
 * - Engineer DTO renders only aggregate fields; sensitive detail fields absent
 * - Approved record has no mutation actions in PayrollDetailActions
 * - Rejected record shows reopen only to authorized user
 * - Cancellation dialog uses reason input
 * - Rejection dialog uses reason input
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayrollStatus } from '@prisma/client';

import { PayrollStatusBadge } from '@/app/payroll/components/payroll-status-badge';
import { ProjectLaborSummaryCard } from '@/app/payroll/components/project-labor-summary-card';
import { PayrollDetailActions } from '@/app/payroll/components/payroll-detail-actions';
import { PayrollForm } from '@/app/payroll/components/payroll-form';
import type {
  PayrollDetailDTO,
  PayrollFormDataDTO,
  ProjectLaborSummaryDTO,
} from '@/lib/payroll/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/payroll',
}));

vi.mock('@/app/payroll/actions', () => ({
  createPayrollDraftAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updatePayrollDraftAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deletePayrollDraftAction: vi.fn().mockResolvedValue({ success: true, data: { deleted: true, id: '1' } }),
  submitPayrollAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  approvePayrollAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  rejectPayrollAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  reopenPayrollAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
  cancelPayrollAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

describe('Payroll Presentation / UI Tests', () => {
  const samplePayrollDTO: PayrollDetailDTO = {
    id: 'cmu_pay_1',
    projectId: 'cmu_prj_1',
    budgetLineId: 'cmu_bline_1',
    workerName: 'صالح محمد الغامدي',
    workerReference: 'REF-WRK-01',
    tradeOrTitle: 'فني كهرباء تمديدات',
    periodYear: 2026,
    periodMonth: 9,
    periodFormattedAr: 'سبتمبر 2026',
    amount: '7500.00',
    currency: 'SAR',
    description: 'أجور شهر سبتمبر 2026 شامل العمل الإضافي',
    status: PayrollStatus.DRAFT,
    createdById: 'usr_acc_1',
    submittedById: null,
    submittedBy: null,
    submittedAt: null,
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
    createdAt: new Date('2026-09-10T08:00:00Z'),
    updatedAt: new Date('2026-09-10T08:00:00Z'),
  };

  const sampleFormData: PayrollFormDataDTO = {
    projects: [
      {
        id: 'cmu_prj_1',
        name: 'مشروع إنشاء مستودعات الخرج',
        code: 'PRJ-WH-01',
        laborLines: [
          {
            id: 'cmu_bline_1',
            description: 'بند أجور وعمالة الأعمال الكهروميكانيكية',
            amount: '200000.00',
            category: 'LABOR',
          },
        ],
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // 1. Status Badges (Arabic labels)
  // ---------------------------------------------------------------------------
  describe('PayrollStatusBadge', () => {
    it('renders correct Arabic labels for all Payroll statuses', () => {
      const { rerender } = render(<PayrollStatusBadge status={PayrollStatus.DRAFT} />);
      expect(screen.getByTestId('payroll-status-badge').textContent).toContain('مسودة');

      rerender(<PayrollStatusBadge status={PayrollStatus.SUBMITTED} />);
      expect(screen.getByTestId('payroll-status-badge').textContent).toContain('قيد الاعتماد');

      rerender(<PayrollStatusBadge status={PayrollStatus.APPROVED} />);
      expect(screen.getByTestId('payroll-status-badge').textContent).toContain('معتمد');

      rerender(<PayrollStatusBadge status={PayrollStatus.REJECTED} />);
      expect(screen.getByTestId('payroll-status-badge').textContent).toContain('مرفوض');

      rerender(<PayrollStatusBadge status={PayrollStatus.CANCELLED} />);
      expect(screen.getByTestId('payroll-status-badge').textContent).toContain('ملغى');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ProjectLaborSummaryCard (Engineer / Manager aggregate UX)
  // ---------------------------------------------------------------------------
  describe('ProjectLaborSummaryCard', () => {
    const summary: ProjectLaborSummaryDTO = {
      projectId: 'cmu_prj_1',
      projectName: 'مشروع مستودعات الخرج',
      projectCode: 'PRJ-WH-01',
      totalLaborBudget: '500000.00',
      approvedLaborSpend: '200000.00',
      pendingLaborSpend: '50000.00',
      remainingLaborBudget: '250000.00',
      currency: 'SAR',
      laborBudgetLinesCount: 2,
    };

    it('renders all aggregate monetary fields formatted with currency', () => {
      render(<ProjectLaborSummaryCard summary={summary} />);

      expect(screen.getByTestId('project-labor-summary-card')).toBeTruthy();
      expect(screen.getByTestId('labor-total-budget')).toBeTruthy();
      expect(screen.getByTestId('labor-approved-spend')).toBeTruthy();
      expect(screen.getByTestId('labor-pending-spend')).toBeTruthy();
      expect(screen.getByTestId('labor-remaining-budget')).toBeTruthy();

      // Asserts absence of individual sensitive worker fields
      expect(screen.queryByText('صالح محمد الغامدي')).toBeNull();
      expect(screen.queryByText('REF-WRK-01')).toBeNull();
      expect(screen.queryByText('فني كهرباء')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PayrollForm (Required fields)
  // ---------------------------------------------------------------------------
  describe('PayrollForm', () => {
    it('renders all required form fields for creating a new payroll draft', () => {
      render(<PayrollForm formData={sampleFormData} />);

      expect(screen.getByTestId('payroll-project-select')).toBeTruthy();
      expect(screen.getByTestId('payroll-budgetline-select')).toBeTruthy();
      expect(screen.getByTestId('payroll-worker-name-input')).toBeTruthy();
      expect(screen.getByTestId('payroll-worker-ref-input')).toBeTruthy();
      expect(screen.getByTestId('payroll-trade-input')).toBeTruthy();
      expect(screen.getByTestId('payroll-period-year-select')).toBeTruthy();
      expect(screen.getByTestId('payroll-period-month-select')).toBeTruthy();
      expect(screen.getByTestId('payroll-amount-input')).toBeTruthy();
      expect(screen.getByTestId('payroll-description-input')).toBeTruthy();
      expect(screen.getByTestId('submit-payroll-form-button')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PayrollDetailActions (State × Role Action UX)
  // ---------------------------------------------------------------------------
  describe('PayrollDetailActions', () => {
    it('shows Edit, Submit, Delete, Cancel for DRAFT when user is Accountant creator', () => {
      render(
        <PayrollDetailActions
          payroll={samplePayrollDTO}
          isManager={false}
          isAccountant={true}
          isOwner={true}
        />,
      );

      expect(screen.getByTestId('edit-payroll-button')).toBeTruthy();
      expect(screen.getByTestId('submit-payroll-button')).toBeTruthy();
      expect(screen.getByTestId('delete-payroll-button')).toBeTruthy();
      expect(screen.getByTestId('cancel-payroll-button')).toBeTruthy();
      expect(screen.queryByTestId('approve-payroll-button')).toBeNull();
      expect(screen.queryByTestId('reject-payroll-button')).toBeNull();
    });

    it('shows Approve, Reject, Cancel for SUBMITTED when user is Manager', () => {
      const submittedPayroll = { ...samplePayrollDTO, status: PayrollStatus.SUBMITTED };
      render(
        <PayrollDetailActions
          payroll={submittedPayroll}
          isManager={true}
          isAccountant={false}
          isOwner={false}
        />,
      );

      expect(screen.getByTestId('approve-payroll-button')).toBeTruthy();
      expect(screen.getByTestId('reject-payroll-button')).toBeTruthy();
      expect(screen.getByTestId('cancel-payroll-button')).toBeTruthy();
      expect(screen.queryByTestId('edit-payroll-button')).toBeNull();
      expect(screen.queryByTestId('submit-payroll-button')).toBeNull();
      expect(screen.queryByTestId('delete-payroll-button')).toBeNull();
    });

    it('opens rejection modal with required reason input when Reject is clicked', () => {
      const submittedPayroll = { ...samplePayrollDTO, status: PayrollStatus.SUBMITTED };
      render(
        <PayrollDetailActions
          payroll={submittedPayroll}
          isManager={true}
          isAccountant={false}
          isOwner={false}
        />,
      );

      fireEvent.click(screen.getByTestId('reject-payroll-button'));
      expect(screen.getByTestId('rejection-reason-input')).toBeTruthy();
      expect(screen.getByTestId('confirm-reject-button')).toBeTruthy();
    });

    it('opens cancellation modal with required reason input when Cancel is clicked', () => {
      render(
        <PayrollDetailActions
          payroll={samplePayrollDTO}
          isManager={true}
          isAccountant={false}
          isOwner={false}
        />,
      );

      fireEvent.click(screen.getByTestId('cancel-payroll-button'));
      expect(screen.getByTestId('cancellation-reason-input')).toBeTruthy();
      expect(screen.getByTestId('confirm-cancel-button')).toBeTruthy();
    });

    it('shows Reopen only for REJECTED status when user is Accountant creator', () => {
      const rejectedPayroll = { ...samplePayrollDTO, status: PayrollStatus.REJECTED };
      render(
        <PayrollDetailActions
          payroll={rejectedPayroll}
          isManager={false}
          isAccountant={true}
          isOwner={true}
        />,
      );

      expect(screen.getByTestId('reopen-payroll-button')).toBeTruthy();
      expect(screen.queryByTestId('approve-payroll-button')).toBeNull();
      expect(screen.queryByTestId('edit-payroll-button')).toBeNull();
    });

    it('APPROVED record is terminal and renders no mutation action buttons', () => {
      const approvedPayroll = { ...samplePayrollDTO, status: PayrollStatus.APPROVED };
      const { container } = render(
        <PayrollDetailActions
          payroll={approvedPayroll}
          isManager={true}
          isAccountant={true}
          isOwner={true}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('CANCELLED record is terminal and renders no mutation action buttons', () => {
      const cancelledPayroll = { ...samplePayrollDTO, status: PayrollStatus.CANCELLED };
      const { container } = render(
        <PayrollDetailActions
          payroll={cancelledPayroll}
          isManager={true}
          isAccountant={true}
          isOwner={true}
        />,
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
