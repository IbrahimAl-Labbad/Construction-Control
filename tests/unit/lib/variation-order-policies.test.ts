/**
 * tests/unit/lib/variation-order-policies.test.ts
 *
 * Unit tests for Variation Order authorization policies and RBAC rules (Slice 20).
 * Tests all 4 roles (MANAGER, ENGINEER, ACCOUNTANT, PURCHASING), separation of duties,
 * object-level creator permissions, and inactive account denial.
 *
 * Follows AGENTS.md §5, §8, §12, §18, §20.
 */

import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { policies } from '@/lib/permissions/policies';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Variation Order RBAC and Authorization Policies', () => {
  const engineerUser: AuthenticatedUser = {
    id: 'user-eng-1',
    email: 'eng1@example.com',
    name: 'مهندس الموقع الأول',
    role: Role.ENGINEER,
    isActive: true,
  };

  const otherEngineerUser: AuthenticatedUser = {
    id: 'user-eng-2',
    email: 'eng2@example.com',
    name: 'مهندس الموقع الثاني',
    role: Role.ENGINEER,
    isActive: true,
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'mgr@example.com',
    name: 'المدير العام',
    role: Role.MANAGER,
    isActive: true,
  };

  const accountantUser: AuthenticatedUser = {
    id: 'user-acc-1',
    email: 'acc@example.com',
    name: 'المحاسب المالي',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const purchasingUser: AuthenticatedUser = {
    id: 'user-pur-1',
    email: 'pur@example.com',
    name: 'مسؤول المشتريات',
    role: Role.PURCHASING,
    isActive: true,
  };

  const inactiveUser: AuthenticatedUser = {
    id: 'user-inactive',
    email: 'inactive@example.com',
    name: 'مستخدم معطل',
    role: Role.ENGINEER,
    isActive: false,
  };

  describe('canCreateVariationOrder', () => {
    it('allows active Site Engineers to create variation orders', () => {
      expect(policies.canCreateVariationOrder(engineerUser)).toBe(true);
    });

    it('denies Managers from creating variation orders (separation of roles)', () => {
      expect(policies.canCreateVariationOrder(managerUser)).toBe(false);
    });

    it('denies Accountants and Purchasing officers', () => {
      expect(policies.canCreateVariationOrder(accountantUser)).toBe(false);
      expect(policies.canCreateVariationOrder(purchasingUser)).toBe(false);
    });

    it('denies inactive engineers', () => {
      expect(policies.canCreateVariationOrder(inactiveUser)).toBe(false);
    });
  });

  describe('canManageVariationOrderDraft', () => {
    it('allows creating engineer to manage own draft', () => {
      expect(
        policies.canManageVariationOrderDraft(engineerUser, { createdById: engineerUser.id }),
      ).toBe(true);
    });

    it('denies a different engineer from modifying the draft', () => {
      expect(
        policies.canManageVariationOrderDraft(otherEngineerUser, { createdById: engineerUser.id }),
      ).toBe(false);
    });

    it('denies non-engineers from modifying the draft', () => {
      expect(
        policies.canManageVariationOrderDraft(managerUser, { createdById: engineerUser.id }),
      ).toBe(false);
      expect(
        policies.canManageVariationOrderDraft(accountantUser, { createdById: engineerUser.id }),
      ).toBe(false);
    });
  });

  describe('canSubmitVariationOrder', () => {
    it('allows creating engineer to submit their draft', () => {
      expect(
        policies.canSubmitVariationOrder(engineerUser, { createdById: engineerUser.id }),
      ).toBe(true);
    });

    it('denies non-creator engineers from submitting', () => {
      expect(
        policies.canSubmitVariationOrder(otherEngineerUser, { createdById: engineerUser.id }),
      ).toBe(false);
    });
  });

  describe('canApproveVariationOrder (Manager & Separation of Duties)', () => {
    it('allows Manager to approve variation orders submitted by engineers', () => {
      expect(
        policies.canApproveVariationOrder(managerUser, {
          createdById: engineerUser.id,
          submittedById: engineerUser.id,
        }),
      ).toBe(true);
    });

    it('enforces separation of duties: denies Manager if manager was the creator', () => {
      expect(
        policies.canApproveVariationOrder(managerUser, {
          createdById: managerUser.id,
          submittedById: 'someone-else',
        }),
      ).toBe(false);
    });

    it('enforces separation of duties: denies Manager if manager was the submitter', () => {
      expect(
        policies.canApproveVariationOrder(managerUser, {
          createdById: 'someone-else',
          submittedById: managerUser.id,
        }),
      ).toBe(false);
    });

    it('denies non-managers from approving', () => {
      expect(policies.canApproveVariationOrder(engineerUser, { createdById: 'user-eng-1' })).toBe(false);
      expect(policies.canApproveVariationOrder(accountantUser, { createdById: 'user-eng-1' })).toBe(false);
      expect(policies.canApproveVariationOrder(purchasingUser, { createdById: 'user-eng-1' })).toBe(false);
    });
  });

  describe('canRejectVariationOrder', () => {
    it('allows active Managers to reject variation orders', () => {
      expect(policies.canRejectVariationOrder(managerUser)).toBe(true);
    });

    it('denies non-managers from rejecting', () => {
      expect(policies.canRejectVariationOrder(engineerUser)).toBe(false);
      expect(policies.canRejectVariationOrder(accountantUser)).toBe(false);
    });
  });

  describe('canReopenVariationOrder', () => {
    it('allows creating engineer to reopen their rejected variation order', () => {
      expect(
        policies.canReopenVariationOrder(engineerUser, { createdById: engineerUser.id }),
      ).toBe(true);
    });

    it('denies non-creators from reopening', () => {
      expect(
        policies.canReopenVariationOrder(otherEngineerUser, { createdById: engineerUser.id }),
      ).toBe(false);
      expect(
        policies.canReopenVariationOrder(managerUser, { createdById: engineerUser.id }),
      ).toBe(false);
    });
  });

  describe('canViewVariationOrders', () => {
    it('allows all 4 active system roles to view variation orders', () => {
      expect(policies.canViewVariationOrders(managerUser)).toBe(true);
      expect(policies.canViewVariationOrders(engineerUser)).toBe(true);
      expect(policies.canViewVariationOrders(accountantUser)).toBe(true);
      expect(policies.canViewVariationOrders(purchasingUser)).toBe(true);
    });

    it('denies inactive accounts', () => {
      expect(policies.canViewVariationOrders(inactiveUser)).toBe(false);
    });
  });
});
