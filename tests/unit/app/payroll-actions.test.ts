/**
 * tests/unit/app/payroll-actions.test.ts
 *
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 * Phase 10: Server Action Boundary Unit Tests.
 *
 * Covers:
 * A. Validation: invalid create, update, rejection, cancellation, and invalid ID.
 * B. Safe result mapping: success, AppError, ValidationError, PermissionError, AuthError.
 * C. Sensitive error leakage: unhandled database/Prisma errors never leak to client.
 * D. Lifecycle delegation: actions delegate directly to use cases rather than duplicating logic.
 * E. Revalidation: correct Next.js cache revalidation triggers.
 * F. Type / client boundary: ensures clean DTOs without Prisma internals.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollStatus } from '@prisma/client';

import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { AuthError } from '@/lib/auth';
import type * as PayrollModule from '@/lib/payroll';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const mockCreatePayrollDraft = vi.fn();
const mockUpdatePayrollDraft = vi.fn();
const mockDeletePayrollDraft = vi.fn();
const mockSubmitPayroll = vi.fn();
const mockApprovePayroll = vi.fn();
const mockRejectPayroll = vi.fn();
const mockReopenPayroll = vi.fn();
const mockCancelPayroll = vi.fn();

vi.mock('@/lib/payroll', async (importOriginal) => {
  const actual = await importOriginal<typeof PayrollModule>();
  return {
    ...actual,
    createPayrollDraft: (...args: unknown[]) => mockCreatePayrollDraft(...args),
    updatePayrollDraft: (...args: unknown[]) => mockUpdatePayrollDraft(...args),
    deletePayrollDraft: (...args: unknown[]) => mockDeletePayrollDraft(...args),
    submitPayroll: (...args: unknown[]) => mockSubmitPayroll(...args),
    approvePayroll: (...args: unknown[]) => mockApprovePayroll(...args),
    rejectPayroll: (...args: unknown[]) => mockRejectPayroll(...args),
    reopenPayroll: (...args: unknown[]) => mockReopenPayroll(...args),
    cancelPayroll: (...args: unknown[]) => mockCancelPayroll(...args),
  };
});

import {
  approvePayrollAction,
  cancelPayrollAction,
  createPayrollDraftAction,
  deletePayrollDraftAction,
  rejectPayrollAction,
  reopenPayrollAction,
  submitPayrollAction,
  updatePayrollDraftAction,
} from '@/app/payroll/actions';

describe('Payroll Server Actions Boundary', () => {
  const sampleProjectId = 'cmu_prj_10000000000000001';
  const samplePayrollId = 'cmu_pay_20000000000000002';
  const sampleBudgetLineId = 'cmu_bline_3000000000000003';

  const mockPayrollDTO: PayrollModule.PayrollDetailDTO = {
    id: samplePayrollId,
    projectId: sampleProjectId,
    budgetLineId: sampleBudgetLineId,
    workerName: 'سعيد العتيبي',
    workerReference: 'REF-WRK-10',
    tradeOrTitle: 'مشرف كهرباء',
    periodYear: 2026,
    periodMonth: 9,
    periodFormattedAr: 'سبتمبر 2026',
    amount: '8500.00',
    currency: 'SAR',
    description: 'أجور شهر سبتمبر 2026',
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
    createdAt: new Date('2026-09-15T10:00:00Z'),
    updatedAt: new Date('2026-09-15T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // A & D. createPayrollDraftAction
  // ---------------------------------------------------------------------------
  describe('createPayrollDraftAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      mockCreatePayrollDraft.mockResolvedValueOnce(mockPayrollDTO);

      const input = {
        projectId: sampleProjectId,
        budgetLineId: sampleBudgetLineId,
        workerName: 'سعيد العتيبي',
        workerReference: 'REF-WRK-10',
        tradeOrTitle: 'مشرف كهرباء',
        periodYear: 2026,
        periodMonth: 9,
        amount: '8500.00',
        currency: 'SAR' as const,
        description: 'أجور شهر سبتمبر 2026',
      };

      const result = await createPayrollDraftAction(input);

      expect(mockCreatePayrollDraft).toHaveBeenCalledWith(input);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/projects/${sampleProjectId}`);
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/projects/${sampleProjectId}/payroll`);

      expect(result).toEqual({
        success: true,
        data: mockPayrollDTO,
      });
    });

    it('maps ValidationError to client-safe failure result', async () => {
      mockCreatePayrollDraft.mockRejectedValueOnce(
        new ValidationError([{ path: 'amount', message: 'المبلغ غير صالح' }]),
      );

      const result = await createPayrollDraftAction({} as never);

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [{ path: 'amount', message: 'المبلغ غير صالح' }],
      });
    });

    it('maps AppError to client-safe failure result', async () => {
      mockCreatePayrollDraft.mockRejectedValueOnce(
        new AppError('DUPLICATE_PAYROLL_ENTRY', 'قيد الراتب مسجل مسبقاً لنفس العامل في نفس الفترة'),
      );

      const result = await createPayrollDraftAction({} as never);

      expect(result).toEqual({
        success: false,
        error: 'DUPLICATE_PAYROLL_ENTRY',
        message: 'قيد الراتب مسجل مسبقاً لنفس العامل في نفس الفترة',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updatePayrollDraftAction
  // ---------------------------------------------------------------------------
  describe('updatePayrollDraftAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const updatedDTO = { ...mockPayrollDTO, amount: '9000.00' };
      mockUpdatePayrollDraft.mockResolvedValueOnce(updatedDTO);

      const input = { amount: '9000.00' };
      const result = await updatePayrollDraftAction(samplePayrollId, input);

      expect(mockUpdatePayrollDraft).toHaveBeenCalledWith(samplePayrollId, input);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/projects/${sampleProjectId}`);
      expect(result).toEqual({
        success: true,
        data: updatedDTO,
      });
    });

    it('maps PermissionError to client-safe failure result', async () => {
      mockUpdatePayrollDraft.mockRejectedValueOnce(
        new PermissionError('FORBIDDEN', ['ACCOUNTANT'], 'MANAGER'),
      );

      const result = await updatePayrollDraftAction(samplePayrollId, {});

      expect(result).toEqual({
        success: false,
        error: 'FORBIDDEN',
        message: 'FORBIDDEN',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // deletePayrollDraftAction
  // ---------------------------------------------------------------------------
  describe('deletePayrollDraftAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      mockDeletePayrollDraft.mockResolvedValueOnce({
        success: true,
        payrollId: samplePayrollId,
      });

      const result = await deletePayrollDraftAction(samplePayrollId);

      expect(mockDeletePayrollDraft).toHaveBeenCalledWith(samplePayrollId);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(result).toEqual({
        success: true,
        data: { deleted: true, id: samplePayrollId },
      });
    });

    it('maps NOT_FOUND AppError to client-safe failure result', async () => {
      mockDeletePayrollDraft.mockRejectedValueOnce(
        new AppError('NOT_FOUND', 'قيد الراتب غير موجود'),
      );

      const result = await deletePayrollDraftAction('non_existent_id');

      expect(result).toEqual({
        success: false,
        error: 'NOT_FOUND',
        message: 'قيد الراتب غير موجود',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // submitPayrollAction
  // ---------------------------------------------------------------------------
  describe('submitPayrollAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const submittedDTO = { ...mockPayrollDTO, status: PayrollStatus.SUBMITTED };
      mockSubmitPayroll.mockResolvedValueOnce(submittedDTO);

      const result = await submitPayrollAction(samplePayrollId);

      expect(mockSubmitPayroll).toHaveBeenCalledWith(samplePayrollId);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(result).toEqual({
        success: true,
        data: submittedDTO,
      });
    });

    it('maps INVALID_STATE_TRANSITION AppError to client-safe failure result', async () => {
      mockSubmitPayroll.mockRejectedValueOnce(
        new AppError('INVALID_STATE_TRANSITION', 'لا يمكن تقديم قيد في هذه الحالة'),
      );

      const result = await submitPayrollAction(samplePayrollId);

      expect(result).toEqual({
        success: false,
        error: 'INVALID_STATE_TRANSITION',
        message: 'لا يمكن تقديم قيد في هذه الحالة',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // approvePayrollAction
  // ---------------------------------------------------------------------------
  describe('approvePayrollAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const approvedDTO = { ...mockPayrollDTO, status: PayrollStatus.APPROVED };
      mockApprovePayroll.mockResolvedValueOnce(approvedDTO);

      const result = await approvePayrollAction(samplePayrollId);

      expect(mockApprovePayroll).toHaveBeenCalledWith(samplePayrollId);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/projects/${sampleProjectId}`);
      expect(result).toEqual({
        success: true,
        data: approvedDTO,
      });
    });

    it('maps BUDGET_LINE_EXCEEDED AppError to client-safe failure result', async () => {
      mockApprovePayroll.mockRejectedValueOnce(
        new AppError('BUDGET_LINE_EXCEEDED', 'مبلغ قيد الرواتب يتجاوز الرصيد المتاح في بند الموازنة'),
      );

      const result = await approvePayrollAction(samplePayrollId);

      expect(result).toEqual({
        success: false,
        error: 'BUDGET_LINE_EXCEEDED',
        message: 'مبلغ قيد الرواتب يتجاوز الرصيد المتاح في بند الموازنة',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // rejectPayrollAction
  // ---------------------------------------------------------------------------
  describe('rejectPayrollAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const rejectedDTO = {
        ...mockPayrollDTO,
        status: PayrollStatus.REJECTED,
        rejectionReason: 'المبلغ غير مطابق لكشف الحضور المعتمد',
      };
      mockRejectPayroll.mockResolvedValueOnce(rejectedDTO);

      const input = { rejectionReason: 'المبلغ غير مطابق لكشف الحضور المعتمد' };
      const result = await rejectPayrollAction(samplePayrollId, input);

      expect(mockRejectPayroll).toHaveBeenCalledWith(samplePayrollId, input);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(result).toEqual({
        success: true,
        data: rejectedDTO,
      });
    });

    it('maps ValidationError on invalid rejection reason to client-safe result', async () => {
      mockRejectPayroll.mockRejectedValueOnce(
        new ValidationError([{ path: 'rejectionReason', message: 'سبب الرفض يجب أن يتكون من 5 أحرف على الأقل' }]),
      );

      const result = await rejectPayrollAction(samplePayrollId, { rejectionReason: 'لا' });

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [{ path: 'rejectionReason', message: 'سبب الرفض يجب أن يتكون من 5 أحرف على الأقل' }],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reopenPayrollAction
  // ---------------------------------------------------------------------------
  describe('reopenPayrollAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const reopenedDTO = { ...mockPayrollDTO, status: PayrollStatus.DRAFT };
      mockReopenPayroll.mockResolvedValueOnce(reopenedDTO);

      const result = await reopenPayrollAction(samplePayrollId);

      expect(mockReopenPayroll).toHaveBeenCalledWith(samplePayrollId);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(result).toEqual({
        success: true,
        data: reopenedDTO,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelPayrollAction
  // ---------------------------------------------------------------------------
  describe('cancelPayrollAction', () => {
    it('delegates to use case, revalidates paths, and returns success result', async () => {
      const cancelledDTO = {
        ...mockPayrollDTO,
        status: PayrollStatus.CANCELLED,
        cancellationReason: 'تم إلغاء المهمة الميدانية للمشروع',
      };
      mockCancelPayroll.mockResolvedValueOnce(cancelledDTO);

      const input = { cancellationReason: 'تم إلغاء المهمة الميدانية للمشروع' };
      const result = await cancelPayrollAction(samplePayrollId, input);

      expect(mockCancelPayroll).toHaveBeenCalledWith(samplePayrollId, input);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/payroll');
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/payroll/${samplePayrollId}`);
      expect(result).toEqual({
        success: true,
        data: cancelledDTO,
      });
    });

    it('maps ValidationError on invalid cancellation reason to client-safe result', async () => {
      mockCancelPayroll.mockRejectedValueOnce(
        new ValidationError([{ path: 'cancellationReason', message: 'سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل' }]),
      );

      const result = await cancelPayrollAction(samplePayrollId, { cancellationReason: 'ق' });

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [{ path: 'cancellationReason', message: 'سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل' }],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // ID validation test
  // ---------------------------------------------------------------------------
  describe('ID Validation', () => {
    it('maps ValidationError on invalid ID to client-safe result', async () => {
      mockSubmitPayroll.mockRejectedValueOnce(
        new ValidationError([{ path: 'payrollId', message: 'معرّف قيد الراتب غير صالح' }]),
      );

      const result = await submitPayrollAction('invalid-id-format');

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [{ path: 'payrollId', message: 'معرّف قيد الراتب غير صالح' }],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // B & C. Error mapping & Sensitive Data Leakage Protection
  // ---------------------------------------------------------------------------
  describe('Error Mapping and Sensitive Data Protection', () => {
    it('maps AuthError to UNAUTHENTICATED client-safe failure result', async () => {
      mockSubmitPayroll.mockRejectedValueOnce(
        new AuthError('UNAUTHENTICATED'),
      );

      const result = await submitPayrollAction(samplePayrollId);

      expect(result).toEqual({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'UNAUTHENTICATED',
      });
    });

    it('C. NEVER LEAKS SQL, Prisma errors, stack traces, or database internals', async () => {
      const sensitiveInternalError = new Error(
        'SELECT * FROM "PayrollEntry" WHERE "workerName" = $1; FATAL: password authentication failed for user "postgres" at 10.0.0.5:5432\n    at PrismaClient.query (/app/node_modules/@prisma/client/runtime.js:123:45)',
      );
      mockApprovePayroll.mockRejectedValueOnce(sensitiveInternalError);

      const result = await approvePayrollAction(samplePayrollId);

      // Verify safe response format
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INTERNAL_ERROR');
        expect(result.message).toBe('حدث خطأ غير متوقع أثناء معالجة بيانات الرواتب');

        // Strictly verify sensitive substrings are absent
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('SELECT');
        expect(serialized).not.toContain('FATAL');
        expect(serialized).not.toContain('password authentication');
        expect(serialized).not.toContain('postgres');
        expect(serialized).not.toContain('10.0.0.5');
        expect(serialized).not.toContain('node_modules');
        expect(serialized).not.toContain('PrismaClient');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // F. Clean Client-Safe DTO Boundary
  // ---------------------------------------------------------------------------
  describe('Client DTO Boundary', () => {
    it('returns monetary fields as strings and contains no Prisma.Decimal or secret tokens', async () => {
      mockApprovePayroll.mockResolvedValueOnce(mockPayrollDTO);

      const result = await approvePayrollAction(samplePayrollId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.amount).toBe('string');
        expect(result.data.amount).toBe('8500.00');

        const serialized = JSON.stringify(result.data);
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('sessionToken');
        expect(serialized).not.toContain('Decimal');
      }
    });
  });
});
