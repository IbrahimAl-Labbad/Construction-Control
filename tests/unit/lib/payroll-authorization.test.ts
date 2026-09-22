/**
 * tests/unit/lib/payroll-authorization.test.ts
 *
 * Unit tests for Payroll authorization policies.
 * Follows AGENTS.md §5 (Four V1 Roles), §6 (Access Control), §12 (Security by Default), and §18 (Authorization Rules).
 *
 * Covers:
 * A. canCreatePayrollDraft (Accountant active only, Manager/Engineer/Purchasing denied, inactive denied)
 * B. canManagePayrollDraft (creator Accountant + DRAFT only, others denied, wrong statuses denied)
 * C. canSubmitPayroll (creator Accountant + DRAFT only, others denied)
 * D. canApprovePayroll (Manager + SUBMITTED + separation of duties, self-approval denied, wrong status denied)
 * E. canRejectPayroll (Manager + SUBMITTED only)
 * F. canReopenPayroll (creator Accountant + REJECTED only)
 * G. canCancelPayroll (DRAFT: owner Accountant or Manager; SUBMITTED: Manager only; REJECTED/APPROVED/CANCELLED: denied)
 * H. canViewPayrollDetails (Manager and Accountant allowed; Engineer and Purchasing denied; inactive denied)
 * I. canViewProjectLaborAggregate (Manager/Accountant allowed; Purchasing denied; Engineer fail-closed)
 * J. Negative security tests covering all 17 explicit security scenarios
 */

import { describe, expect, it } from 'vitest';
import { Role, PayrollStatus } from '@prisma/client';
import {
  policies,
  canCreatePayrollDraft,
  canManagePayrollDraft,
  canSubmitPayroll,
  canApprovePayroll,
  canRejectPayroll,
  canReopenPayroll,
  canCancelPayroll,
  canViewPayrollDetails,
  canViewProjectLaborAggregate,
} from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Payroll Authorization Policies', () => {
  // Test users across all 4 roles
  const accountant1: AuthenticatedUser = {
    id: 'usr-acc-1',
    email: 'acc1@example.com',
    name: 'المحاسب الأول',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const accountant2: AuthenticatedUser = {
    id: 'usr-acc-2',
    email: 'acc2@example.com',
    name: 'المحاسب الثاني',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const managerUser: AuthenticatedUser = {
    id: 'usr-mgr-1',
    email: 'mgr@example.com',
    name: 'مدير المشروع',
    role: Role.MANAGER,
    isActive: true,
  };

  const engineerUser: AuthenticatedUser = {
    id: 'usr-eng-1',
    email: 'eng@example.com',
    name: 'مهندس الموقع',
    role: Role.ENGINEER,
    isActive: true,
  };

  const purchasingUser: AuthenticatedUser = {
    id: 'usr-pur-1',
    email: 'pur@example.com',
    name: 'مسؤول المشتريات',
    role: Role.PURCHASING,
    isActive: true,
  };

  // Inactive test users
  const inactiveAccountant: AuthenticatedUser = { ...accountant1, isActive: false };
  const inactiveManager: AuthenticatedUser = { ...managerUser, isActive: false };
  const inactiveEngineer: AuthenticatedUser = { ...engineerUser, isActive: false };
  const inactivePurchasing: AuthenticatedUser = { ...purchasingUser, isActive: false };

  // Sample entry fixtures
  const draftEntryOwnedByAcc1 = {
    createdById: accountant1.id,
    status: PayrollStatus.DRAFT,
  };

  const submittedEntryOwnedByAcc1 = {
    createdById: accountant1.id,
    status: PayrollStatus.SUBMITTED,
  };

  const rejectedEntryOwnedByAcc1 = {
    createdById: accountant1.id,
    status: PayrollStatus.REJECTED,
  };

  const approvedEntryOwnedByAcc1 = {
    createdById: accountant1.id,
    status: PayrollStatus.APPROVED,
  };

  const cancelledEntryOwnedByAcc1 = {
    createdById: accountant1.id,
    status: PayrollStatus.CANCELLED,
  };

  // -------------------------------------------------------------------------
  // A. canCreatePayrollDraft
  // -------------------------------------------------------------------------
  describe('canCreatePayrollDraft', () => {
    it('allows active ACCOUNTANT to create payroll draft', () => {
      expect(canCreatePayrollDraft(accountant1)).toBe(true);
      expect(policies.canCreatePayrollDraft(accountant1)).toBe(true);
    });

    it('denies inactive ACCOUNTANT', () => {
      expect(canCreatePayrollDraft(inactiveAccountant)).toBe(false);
    });

    it('denies MANAGER from creating routine payroll draft (separation of data-entry vs approval)', () => {
      expect(canCreatePayrollDraft(managerUser)).toBe(false);
    });

    it('denies ENGINEER from creating payroll draft', () => {
      expect(canCreatePayrollDraft(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from creating payroll draft', () => {
      expect(canCreatePayrollDraft(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // B. canManagePayrollDraft (Edit / Delete)
  // -------------------------------------------------------------------------
  describe('canManagePayrollDraft', () => {
    it('allows active creator ACCOUNTANT to manage own DRAFT', () => {
      expect(canManagePayrollDraft(accountant1, draftEntryOwnedByAcc1)).toBe(true);
    });

    it('denies different ACCOUNTANT from managing another accountant draft', () => {
      expect(canManagePayrollDraft(accountant2, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies MANAGER from editing or deleting draft directly', () => {
      expect(canManagePayrollDraft(managerUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies ENGINEER from managing draft', () => {
      expect(canManagePayrollDraft(engineerUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies PURCHASING from managing draft', () => {
      expect(canManagePayrollDraft(purchasingUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies managing when entry is not in DRAFT status', () => {
      expect(canManagePayrollDraft(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canManagePayrollDraft(accountant1, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canManagePayrollDraft(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canManagePayrollDraft(accountant1, cancelledEntryOwnedByAcc1)).toBe(false);
    });

    it('denies inactive creator ACCOUNTANT', () => {
      expect(canManagePayrollDraft(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // C. canSubmitPayroll
  // -------------------------------------------------------------------------
  describe('canSubmitPayroll', () => {
    it('allows active creator ACCOUNTANT to submit own DRAFT', () => {
      expect(canSubmitPayroll(accountant1, draftEntryOwnedByAcc1)).toBe(true);
    });

    it('denies different ACCOUNTANT from submitting draft', () => {
      expect(canSubmitPayroll(accountant2, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies MANAGER from submitting draft', () => {
      expect(canSubmitPayroll(managerUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies ENGINEER from submitting draft', () => {
      expect(canSubmitPayroll(engineerUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies PURCHASING from submitting draft', () => {
      expect(canSubmitPayroll(purchasingUser, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('denies submit when entry is not in DRAFT status', () => {
      expect(canSubmitPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canSubmitPayroll(accountant1, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canSubmitPayroll(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canSubmitPayroll(accountant1, cancelledEntryOwnedByAcc1)).toBe(false);
    });

    it('denies inactive creator ACCOUNTANT', () => {
      expect(canSubmitPayroll(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // D. canApprovePayroll
  // -------------------------------------------------------------------------
  describe('canApprovePayroll', () => {
    it('allows active MANAGER to approve SUBMITTED entry created by someone else', () => {
      expect(canApprovePayroll(managerUser, submittedEntryOwnedByAcc1)).toBe(true);
    });

    it('denies MANAGER self-approval if creatorId matches manager id', () => {
      const managerCreatedEntry = {
        createdById: managerUser.id,
        status: PayrollStatus.SUBMITTED,
      };
      expect(canApprovePayroll(managerUser, managerCreatedEntry)).toBe(false);
    });

    it('denies ACCOUNTANT from approving payroll (own or other)', () => {
      expect(canApprovePayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canApprovePayroll(accountant2, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies ENGINEER from approving payroll', () => {
      expect(canApprovePayroll(engineerUser, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies PURCHASING from approving payroll', () => {
      expect(canApprovePayroll(purchasingUser, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies approval when status is not SUBMITTED', () => {
      expect(canApprovePayroll(managerUser, draftEntryOwnedByAcc1)).toBe(false);
      expect(canApprovePayroll(managerUser, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canApprovePayroll(managerUser, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canApprovePayroll(managerUser, cancelledEntryOwnedByAcc1)).toBe(false);
    });

    it('denies inactive MANAGER', () => {
      expect(canApprovePayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // E. canRejectPayroll
  // -------------------------------------------------------------------------
  describe('canRejectPayroll', () => {
    it('allows active MANAGER to reject SUBMITTED entry', () => {
      expect(canRejectPayroll(managerUser, submittedEntryOwnedByAcc1)).toBe(true);
    });

    it('denies non-managers from rejecting payroll', () => {
      expect(canRejectPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(engineerUser, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(purchasingUser, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies rejection when entry is not in SUBMITTED status', () => {
      expect(canRejectPayroll(managerUser, draftEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(managerUser, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(managerUser, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(managerUser, cancelledEntryOwnedByAcc1)).toBe(false);
    });

    it('denies inactive MANAGER', () => {
      expect(canRejectPayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // F. canReopenPayroll
  // -------------------------------------------------------------------------
  describe('canReopenPayroll', () => {
    it('allows active creator ACCOUNTANT to reopen REJECTED entry', () => {
      expect(canReopenPayroll(accountant1, rejectedEntryOwnedByAcc1)).toBe(true);
    });

    it('denies another ACCOUNTANT from reopening rejected entry', () => {
      expect(canReopenPayroll(accountant2, rejectedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies MANAGER from reopening rejected entry', () => {
      expect(canReopenPayroll(managerUser, rejectedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies ENGINEER and PURCHASING from reopening rejected entry', () => {
      expect(canReopenPayroll(engineerUser, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(purchasingUser, rejectedEntryOwnedByAcc1)).toBe(false);
    });

    it('denies reopen when entry is not REJECTED', () => {
      expect(canReopenPayroll(accountant1, draftEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(accountant1, cancelledEntryOwnedByAcc1)).toBe(false);
    });

    it('denies inactive creator ACCOUNTANT', () => {
      expect(canReopenPayroll(inactiveAccountant, rejectedEntryOwnedByAcc1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // G. canCancelPayroll (Corrected State + Role matrix)
  // -------------------------------------------------------------------------
  describe('canCancelPayroll', () => {
    describe('When status is DRAFT', () => {
      it('allows creator ACCOUNTANT to cancel own DRAFT', () => {
        expect(canCancelPayroll(accountant1, draftEntryOwnedByAcc1)).toBe(true);
      });

      it('allows MANAGER to cancel DRAFT', () => {
        expect(canCancelPayroll(managerUser, draftEntryOwnedByAcc1)).toBe(true);
      });

      it('denies different ACCOUNTANT from cancelling draft', () => {
        expect(canCancelPayroll(accountant2, draftEntryOwnedByAcc1)).toBe(false);
      });

      it('denies ENGINEER and PURCHASING from cancelling draft', () => {
        expect(canCancelPayroll(engineerUser, draftEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(purchasingUser, draftEntryOwnedByAcc1)).toBe(false);
      });

      it('denies inactive users', () => {
        expect(canCancelPayroll(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(inactiveManager, draftEntryOwnedByAcc1)).toBe(false);
      });
    });

    describe('When status is SUBMITTED', () => {
      it('allows MANAGER to cancel SUBMITTED entry', () => {
        expect(canCancelPayroll(managerUser, submittedEntryOwnedByAcc1)).toBe(true);
      });

      it('denies ACCOUNTANT (even creator) from cancelling SUBMITTED entry', () => {
        expect(canCancelPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(accountant2, submittedEntryOwnedByAcc1)).toBe(false);
      });

      it('denies ENGINEER and PURCHASING from cancelling SUBMITTED entry', () => {
        expect(canCancelPayroll(engineerUser, submittedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(purchasingUser, submittedEntryOwnedByAcc1)).toBe(false);
      });

      it('denies inactive MANAGER', () => {
        expect(canCancelPayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
      });
    });

    describe('When status is REJECTED', () => {
      it('denies everyone from cancelling REJECTED entry', () => {
        expect(canCancelPayroll(managerUser, rejectedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(accountant1, rejectedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(engineerUser, rejectedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(purchasingUser, rejectedEntryOwnedByAcc1)).toBe(false);
      });
    });

    describe('When status is APPROVED (strictly immutable ledger invariant)', () => {
      it('denies everyone from cancelling APPROVED entry', () => {
        expect(canCancelPayroll(managerUser, approvedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(engineerUser, approvedEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(purchasingUser, approvedEntryOwnedByAcc1)).toBe(false);
      });
    });

    describe('When status is CANCELLED (terminal state)', () => {
      it('denies everyone from cancelling CANCELLED entry', () => {
        expect(canCancelPayroll(managerUser, cancelledEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(accountant1, cancelledEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(engineerUser, cancelledEntryOwnedByAcc1)).toBe(false);
        expect(canCancelPayroll(purchasingUser, cancelledEntryOwnedByAcc1)).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // H. canViewPayrollDetails
  // -------------------------------------------------------------------------
  describe('canViewPayrollDetails', () => {
    it('allows active MANAGER to view detailed payroll entries', () => {
      expect(canViewPayrollDetails(managerUser)).toBe(true);
    });

    it('allows active ACCOUNTANT to view detailed payroll entries', () => {
      expect(canViewPayrollDetails(accountant1)).toBe(true);
    });

    it('denies ENGINEER from viewing detailed payroll entries', () => {
      expect(canViewPayrollDetails(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from viewing detailed payroll entries', () => {
      expect(canViewPayrollDetails(purchasingUser)).toBe(false);
    });

    it('denies inactive MANAGER and ACCOUNTANT', () => {
      expect(canViewPayrollDetails(inactiveManager)).toBe(false);
      expect(canViewPayrollDetails(inactiveAccountant)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // I. canViewProjectLaborAggregate (Fail-closed for Engineer)
  // -------------------------------------------------------------------------
  describe('canViewProjectLaborAggregate', () => {
    it('allows active MANAGER to view project labor aggregate', () => {
      expect(canViewProjectLaborAggregate(managerUser)).toBe(true);
    });

    it('allows active ACCOUNTANT to view project labor aggregate', () => {
      expect(canViewProjectLaborAggregate(accountant1)).toBe(true);
    });

    it('HARD DENY: denies PURCHASING from viewing project labor aggregate', () => {
      expect(canViewProjectLaborAggregate(purchasingUser)).toBe(false);
      expect(canViewProjectLaborAggregate(purchasingUser, true)).toBe(false);
    });

    it('FAIL-CLOSED: denies ENGINEER when project scope is omitted or undefined', () => {
      expect(canViewProjectLaborAggregate(engineerUser)).toBe(false);
      expect(canViewProjectLaborAggregate(engineerUser, undefined)).toBe(false);
    });

    it('FAIL-CLOSED: denies ENGINEER when project scope is false or unverified', () => {
      expect(canViewProjectLaborAggregate(engineerUser, false)).toBe(false);
      expect(canViewProjectLaborAggregate(engineerUser, { hasProjectAccess: false })).toBe(false);
      expect(canViewProjectLaborAggregate(engineerUser, { isAssignedEngineer: false })).toBe(false);
    });

    it('allows ENGINEER only when safe project scope is explicitly proven and validated', () => {
      expect(canViewProjectLaborAggregate(engineerUser, true)).toBe(true);
      expect(canViewProjectLaborAggregate(engineerUser, { hasProjectAccess: true })).toBe(true);
      expect(canViewProjectLaborAggregate(engineerUser, { isAssignedEngineer: true })).toBe(true);
    });

    it('denies inactive users even if scope is provided', () => {
      expect(canViewProjectLaborAggregate(inactiveManager)).toBe(false);
      expect(canViewProjectLaborAggregate(inactiveAccountant)).toBe(false);
      expect(canViewProjectLaborAggregate(inactiveEngineer, true)).toBe(false);
      expect(canViewProjectLaborAggregate(inactivePurchasing, true)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // J. Negative Security Tests (Explicit 17 Scenarios)
  // -------------------------------------------------------------------------
  describe('Negative Security Tests (17 Explicit Scenarios)', () => {
    it('Scenario 1: inactive Accountant is denied on all payroll actions', () => {
      expect(canCreatePayrollDraft(inactiveAccountant)).toBe(false);
      expect(canManagePayrollDraft(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
      expect(canSubmitPayroll(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(inactiveAccountant, rejectedEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(inactiveAccountant, draftEntryOwnedByAcc1)).toBe(false);
      expect(canViewPayrollDetails(inactiveAccountant)).toBe(false);
    });

    it('Scenario 2: inactive Manager is denied on all payroll actions', () => {
      expect(canApprovePayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canRejectPayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(inactiveManager, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canViewPayrollDetails(inactiveManager)).toBe(false);
    });

    it('Scenario 3: inactive Engineer is denied on all payroll actions', () => {
      expect(canCreatePayrollDraft(inactiveEngineer)).toBe(false);
      expect(canViewPayrollDetails(inactiveEngineer)).toBe(false);
      expect(canViewProjectLaborAggregate(inactiveEngineer, true)).toBe(false);
    });

    it('Scenario 4: inactive Purchasing is denied on all payroll actions', () => {
      expect(canCreatePayrollDraft(inactivePurchasing)).toBe(false);
      expect(canViewPayrollDetails(inactivePurchasing)).toBe(false);
      expect(canViewProjectLaborAggregate(inactivePurchasing, true)).toBe(false);
    });

    it('Scenario 5: Accountant approving own record is strictly denied', () => {
      expect(canApprovePayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 6: Accountant approving another person record is strictly denied', () => {
      expect(canApprovePayroll(accountant2, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 7: Manager trying to create routine payroll entry is denied', () => {
      expect(canCreatePayrollDraft(managerUser)).toBe(false);
    });

    it('Scenario 8: Engineer requesting detailed payroll entries is denied', () => {
      expect(canViewPayrollDetails(engineerUser)).toBe(false);
    });

    it('Scenario 9: Purchasing requesting detailed payroll entries is denied', () => {
      expect(canViewPayrollDetails(purchasingUser)).toBe(false);
    });

    it('Scenario 10: Purchasing requesting labor aggregate is denied', () => {
      expect(canViewProjectLaborAggregate(purchasingUser)).toBe(false);
      expect(canViewProjectLaborAggregate(purchasingUser, true)).toBe(false);
    });

    it('Scenario 11: Engineer requesting aggregate with no project scope is denied', () => {
      expect(canViewProjectLaborAggregate(engineerUser)).toBe(false);
      expect(canViewProjectLaborAggregate(engineerUser, undefined)).toBe(false);
    });

    it('Scenario 12: Accountant managing another accountant draft is denied', () => {
      expect(canManagePayrollDraft(accountant2, draftEntryOwnedByAcc1)).toBe(false);
      expect(canSubmitPayroll(accountant2, draftEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(accountant2, draftEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 13: Manager cancelling REJECTED entry is denied', () => {
      expect(canCancelPayroll(managerUser, rejectedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 14: Accountant cancelling SUBMITTED entry is denied', () => {
      expect(canCancelPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 15: anyone cancelling APPROVED entry is denied', () => {
      expect(canCancelPayroll(managerUser, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(engineerUser, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canCancelPayroll(purchasingUser, approvedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 16: anyone reopening APPROVED entry is denied', () => {
      expect(canReopenPayroll(accountant1, approvedEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(managerUser, approvedEntryOwnedByAcc1)).toBe(false);
    });

    it('Scenario 17: anyone reopening non-REJECTED entry is denied', () => {
      expect(canReopenPayroll(accountant1, draftEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(accountant1, submittedEntryOwnedByAcc1)).toBe(false);
      expect(canReopenPayroll(accountant1, cancelledEntryOwnedByAcc1)).toBe(false);
    });
  });
});
