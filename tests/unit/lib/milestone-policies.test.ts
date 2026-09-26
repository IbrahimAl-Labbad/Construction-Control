import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { policies } from '@/lib/permissions/policies';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Milestone Authorization Policies (Unit Tests)', () => {
  const managerUser: AuthenticatedUser = {
    id: 'mgr-1',
    name: 'المدير',
    email: 'mgr@test.local',
    role: Role.MANAGER,
    isActive: true,
  };

  const engineerUser: AuthenticatedUser = {
    id: 'eng-1',
    name: 'المهندس',
    email: 'eng@test.local',
    role: Role.ENGINEER,
    isActive: true,
  };

  const accountantUser: AuthenticatedUser = {
    id: 'acc-1',
    name: 'المحاسب',
    email: 'acc@test.local',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const purchasingUser: AuthenticatedUser = {
    id: 'pur-1',
    name: 'المشتريات',
    email: 'pur@test.local',
    role: Role.PURCHASING,
    isActive: true,
  };

  const inactiveManager: AuthenticatedUser = {
    ...managerUser,
    isActive: false,
  };

  describe('canManageMilestones (BD-12-01)', () => {
    it('allows active Manager', () => {
      expect(policies.canManageMilestones(managerUser)).toBe(true);
    });

    it('denies inactive Manager', () => {
      expect(policies.canManageMilestones(inactiveManager)).toBe(false);
    });

    it('denies Engineer, Accountant, Purchasing', () => {
      expect(policies.canManageMilestones(engineerUser)).toBe(false);
      expect(policies.canManageMilestones(accountantUser)).toBe(false);
      expect(policies.canManageMilestones(purchasingUser)).toBe(false);
    });
  });

  describe('canViewProjectMilestones (BD-12-02, BD-12-03, BD-12-04)', () => {
    it('allows Manager, Accountant, Purchasing', () => {
      expect(policies.canViewProjectMilestones(managerUser, false)).toBe(true);
      expect(policies.canViewProjectMilestones(accountantUser, false)).toBe(true);
      expect(policies.canViewProjectMilestones(purchasingUser, false)).toBe(true);
    });

    it('allows Engineer ONLY IF assigned to project', () => {
      expect(policies.canViewProjectMilestones(engineerUser, true)).toBe(true);
      expect(policies.canViewProjectMilestones(engineerUser, false)).toBe(false);
    });

    it('denies inactive users', () => {
      expect(policies.canViewProjectMilestones(inactiveManager, true)).toBe(false);
    });
  });
});
