/**
 * tests/unit/lib/subcontractor-billing-authorization.test.ts
 *
 * Unit tests for Subcontractor Billing authorization policies.
 * Follows AGENTS.md §5 (Four V1 Roles), §6 (Access Control), §12 (Security by Default), and §18 (Authorization Rules).
 *
 * Tests the 7 fine-grained policy functions in policies.ts:
 * 1. canCreateBilling (ACCOUNTANT only)
 * 2. canManageBillingDraft (ACCOUNTANT only)
 * 3. canSubmitBilling (ACCOUNTANT only)
 * 4. canApproveBilling (MANAGER only)
 * 5. canRejectBilling (MANAGER only)
 * 6. canCancelBilling (MANAGER only)
 * 7. canViewBillings (MANAGER, ENGINEER, ACCOUNTANT allowed; PURCHASING denied)
 *
 * Also verifies inactive user behavior across all 4 roles following existing policy conventions.
 */

import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { policies } from '@/lib/permissions/policies';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Subcontractor Billing Authorization Policies', () => {
  // Active test users across all 4 roles
  const accountantUser: AuthenticatedUser = {
    id: 'usr-acc-1',
    email: 'accountant@example.com',
    name: 'المحاسب المالي',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const managerUser: AuthenticatedUser = {
    id: 'usr-mgr-1',
    email: 'manager@example.com',
    name: 'مدير المشاريع',
    role: Role.MANAGER,
    isActive: true,
  };

  const engineerUser: AuthenticatedUser = {
    id: 'usr-eng-1',
    email: 'engineer@example.com',
    name: 'مهندس الموقع',
    role: Role.ENGINEER,
    isActive: true,
  };

  const purchasingUser: AuthenticatedUser = {
    id: 'usr-pur-1',
    email: 'purchasing@example.com',
    name: 'مسؤول المشتريات',
    role: Role.PURCHASING,
    isActive: true,
  };

  // Inactive test users
  const inactiveAccountant: AuthenticatedUser = { ...accountantUser, isActive: false };
  const inactiveManager: AuthenticatedUser = { ...managerUser, isActive: false };
  const inactiveEngineer: AuthenticatedUser = { ...engineerUser, isActive: false };
  const inactivePurchasing: AuthenticatedUser = { ...purchasingUser, isActive: false };

  // -------------------------------------------------------------------------
  // 1. canCreateBilling
  // -------------------------------------------------------------------------
  describe('canCreateBilling', () => {
    it('allows ACCOUNTANT to create billing draft', () => {
      expect(policies.canCreateBilling(accountantUser)).toBe(true);
    });

    it('denies MANAGER from creating billing draft (separation of data-entry vs approval)', () => {
      expect(policies.canCreateBilling(managerUser)).toBe(false);
    });

    it('denies ENGINEER from creating subcontractor billing draft', () => {
      expect(policies.canCreateBilling(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from creating subcontractor billing draft', () => {
      expect(policies.canCreateBilling(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. canManageBillingDraft
  // -------------------------------------------------------------------------
  describe('canManageBillingDraft', () => {
    it('allows ACCOUNTANT to manage billing draft', () => {
      expect(policies.canManageBillingDraft(accountantUser)).toBe(true);
    });

    it('denies MANAGER from editing or deleting draft directly', () => {
      expect(policies.canManageBillingDraft(managerUser)).toBe(false);
    });

    it('denies ENGINEER from managing billing draft', () => {
      expect(policies.canManageBillingDraft(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from managing billing draft', () => {
      expect(policies.canManageBillingDraft(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. canSubmitBilling
  // -------------------------------------------------------------------------
  describe('canSubmitBilling', () => {
    it('allows ACCOUNTANT to submit billing for manager approval', () => {
      expect(policies.canSubmitBilling(accountantUser)).toBe(true);
    });

    it('denies MANAGER from submitting billing', () => {
      expect(policies.canSubmitBilling(managerUser)).toBe(false);
    });

    it('denies ENGINEER from submitting billing', () => {
      expect(policies.canSubmitBilling(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from submitting billing', () => {
      expect(policies.canSubmitBilling(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. canApproveBilling
  // -------------------------------------------------------------------------
  describe('canApproveBilling', () => {
    it('allows MANAGER to approve billing (sole certification authority)', () => {
      expect(policies.canApproveBilling(managerUser)).toBe(true);
    });

    it('denies ACCOUNTANT from approving billing', () => {
      expect(policies.canApproveBilling(accountantUser)).toBe(false);
    });

    it('denies ENGINEER from approving billing', () => {
      expect(policies.canApproveBilling(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from approving billing', () => {
      expect(policies.canApproveBilling(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. canRejectBilling
  // -------------------------------------------------------------------------
  describe('canRejectBilling', () => {
    it('allows MANAGER to reject billing', () => {
      expect(policies.canRejectBilling(managerUser)).toBe(true);
    });

    it('denies ACCOUNTANT from rejecting billing', () => {
      expect(policies.canRejectBilling(accountantUser)).toBe(false);
    });

    it('denies ENGINEER from rejecting billing', () => {
      expect(policies.canRejectBilling(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from rejecting billing', () => {
      expect(policies.canRejectBilling(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. canCancelBilling
  // -------------------------------------------------------------------------
  describe('canCancelBilling', () => {
    it('allows MANAGER to cancel billing', () => {
      expect(policies.canCancelBilling(managerUser)).toBe(true);
    });

    it('denies ACCOUNTANT from cancelling billing via manager cancellation policy', () => {
      expect(policies.canCancelBilling(accountantUser)).toBe(false);
    });

    it('denies ENGINEER from cancelling billing', () => {
      expect(policies.canCancelBilling(engineerUser)).toBe(false);
    });

    it('denies PURCHASING from cancelling billing', () => {
      expect(policies.canCancelBilling(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. canViewBillings
  // -------------------------------------------------------------------------
  describe('canViewBillings', () => {
    it('allows MANAGER to view billings', () => {
      expect(policies.canViewBillings(managerUser)).toBe(true);
    });

    it('allows ENGINEER to view billings (field oversight)', () => {
      expect(policies.canViewBillings(engineerUser)).toBe(true);
    });

    it('allows ACCOUNTANT to view billings (billing preparation and reconciliation)', () => {
      expect(policies.canViewBillings(accountantUser)).toBe(true);
    });

    it('denies PURCHASING from viewing subcontractor billings (strict boundary AGENTS.md §5.4)', () => {
      expect(policies.canViewBillings(purchasingUser)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Inactive User Behavior across Policies
  // -------------------------------------------------------------------------
  describe('Inactive User Behavior (AGENTS.md §17 & §18 Policy Conventions)', () => {
    it('demonstrates policy-level role evaluation for inactive accountant', () => {
      // In policies.ts, role-based policies evaluate user.role.
      // Server-side session verification (requireAuth / requireRole) acts as the outer gate,
      // rejecting inactive accounts with ACCOUNT_INACTIVE before policies are checked.
      expect(policies.canCreateBilling(inactiveAccountant)).toBe(true);
      expect(policies.canManageBillingDraft(inactiveAccountant)).toBe(true);
      expect(policies.canSubmitBilling(inactiveAccountant)).toBe(true);
      expect(policies.canApproveBilling(inactiveAccountant)).toBe(false);
      expect(policies.canRejectBilling(inactiveAccountant)).toBe(false);
      expect(policies.canCancelBilling(inactiveAccountant)).toBe(false);
      expect(policies.canViewBillings(inactiveAccountant)).toBe(true);
    });

    it('demonstrates policy-level role evaluation for inactive manager', () => {
      expect(policies.canCreateBilling(inactiveManager)).toBe(false);
      expect(policies.canManageBillingDraft(inactiveManager)).toBe(false);
      expect(policies.canSubmitBilling(inactiveManager)).toBe(false);
      expect(policies.canApproveBilling(inactiveManager)).toBe(true);
      expect(policies.canRejectBilling(inactiveManager)).toBe(true);
      expect(policies.canCancelBilling(inactiveManager)).toBe(true);
      expect(policies.canViewBillings(inactiveManager)).toBe(true);
    });

    it('demonstrates policy-level role evaluation for inactive engineer', () => {
      expect(policies.canCreateBilling(inactiveEngineer)).toBe(false);
      expect(policies.canManageBillingDraft(inactiveEngineer)).toBe(false);
      expect(policies.canSubmitBilling(inactiveEngineer)).toBe(false);
      expect(policies.canApproveBilling(inactiveEngineer)).toBe(false);
      expect(policies.canRejectBilling(inactiveEngineer)).toBe(false);
      expect(policies.canCancelBilling(inactiveEngineer)).toBe(false);
      expect(policies.canViewBillings(inactiveEngineer)).toBe(true);
    });

    it('strictly denies purchasing across all billing actions regardless of active status', () => {
      expect(policies.canCreateBilling(inactivePurchasing)).toBe(false);
      expect(policies.canManageBillingDraft(inactivePurchasing)).toBe(false);
      expect(policies.canSubmitBilling(inactivePurchasing)).toBe(false);
      expect(policies.canApproveBilling(inactivePurchasing)).toBe(false);
      expect(policies.canRejectBilling(inactivePurchasing)).toBe(false);
      expect(policies.canCancelBilling(inactivePurchasing)).toBe(false);
      expect(policies.canViewBillings(inactivePurchasing)).toBe(false);
    });
  });
});
