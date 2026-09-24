import { describe, it, expect } from 'vitest';
import { Role, ProgressReportStatus } from '@prisma/client';
import { policies } from '@/lib/permissions/policies';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('ProgressReport Policies', () => {
  const engineerUser: AuthenticatedUser = {
    id: 'user-eng-1',
    role: Role.ENGINEER,
    isActive: true,
  };

  const otherEngineer: AuthenticatedUser = {
    id: 'user-eng-2',
    role: Role.ENGINEER,
    isActive: true,
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    role: Role.MANAGER,
    isActive: true,
  };

  const accountantUser: AuthenticatedUser = {
    id: 'user-acc-1',
    role: Role.ACCOUNTANT,
    isActive: true,
  };

  const purchasingUser: AuthenticatedUser = {
    id: 'user-pur-1',
    role: Role.PURCHASING,
    isActive: true,
  };

  const draftResource = {
    id: 'report-1',
    status: ProgressReportStatus.DRAFT,
    createdById: 'user-eng-1',
  };

  const submittedResource = {
    id: 'report-1',
    status: ProgressReportStatus.SUBMITTED,
    createdById: 'user-eng-1',
  };

  const approvedResource = {
    id: 'report-1',
    status: ProgressReportStatus.APPROVED,
    createdById: 'user-eng-1',
  };

  const rejectedResource = {
    id: 'report-1',
    status: ProgressReportStatus.REJECTED,
    createdById: 'user-eng-1',
  };

  it('canCreateProgressReport allows ENGINEER only', () => {
    expect(policies.canCreateProgressReport(engineerUser)).toBe(true);
    expect(policies.canCreateProgressReport(managerUser)).toBe(false);
    expect(policies.canCreateProgressReport(accountantUser)).toBe(false);
    expect(policies.canCreateProgressReport(purchasingUser)).toBe(false);
  });

  it('canManageProgressReportDraft requires creator engineer and DRAFT status', () => {
    expect(policies.canManageProgressReportDraft(engineerUser, draftResource)).toBe(true);
    // Other engineer denied
    expect(policies.canManageProgressReportDraft(otherEngineer, draftResource)).toBe(false);
    // Manager denied
    expect(policies.canManageProgressReportDraft(managerUser, draftResource)).toBe(false);
    // Non-draft status denied
    expect(policies.canManageProgressReportDraft(engineerUser, submittedResource)).toBe(false);
  });

  it('canSubmitProgressReport requires creator engineer and DRAFT status', () => {
    expect(policies.canSubmitProgressReport(engineerUser, draftResource)).toBe(true);
    expect(policies.canSubmitProgressReport(otherEngineer, draftResource)).toBe(false);
    expect(policies.canSubmitProgressReport(engineerUser, submittedResource)).toBe(false);
  });

  it('canApproveProgressReport allows MANAGER only', () => {
    expect(policies.canApproveProgressReport(managerUser)).toBe(true);
    expect(policies.canApproveProgressReport(engineerUser)).toBe(false);
    expect(policies.canApproveProgressReport(accountantUser)).toBe(false);
  });

  it('canRejectProgressReport allows MANAGER only', () => {
    expect(policies.canRejectProgressReport(managerUser)).toBe(true);
    expect(policies.canRejectProgressReport(engineerUser)).toBe(false);
    expect(policies.canRejectProgressReport(purchasingUser)).toBe(false);
  });

  it('canReopenProgressReport requires creator engineer and REJECTED status', () => {
    expect(policies.canReopenProgressReport(engineerUser, rejectedResource)).toBe(true);
    expect(policies.canReopenProgressReport(otherEngineer, rejectedResource)).toBe(false);
    expect(policies.canReopenProgressReport(engineerUser, approvedResource)).toBe(false);
    expect(policies.canReopenProgressReport(managerUser, rejectedResource)).toBe(false);
  });

  it('canCancelProgressReport handles both Engineer and Manager rules (BD-08)', () => {
    // Engineer can cancel own DRAFT
    expect(policies.canCancelProgressReport(engineerUser, draftResource)).toBe(true);
    expect(policies.canCancelProgressReport(otherEngineer, draftResource)).toBe(false);
    expect(policies.canCancelProgressReport(engineerUser, submittedResource)).toBe(false);

    // Manager can cancel DRAFT or SUBMITTED
    expect(policies.canCancelProgressReport(managerUser, draftResource)).toBe(true);
    expect(policies.canCancelProgressReport(managerUser, submittedResource)).toBe(true);
    expect(policies.canCancelProgressReport(managerUser, approvedResource)).toBe(false);

    // Accountant/Purchasing denied
    expect(policies.canCancelProgressReport(accountantUser, draftResource)).toBe(false);
  });

  it('canViewProgressReport enforces role and IDOR (BD-16, BD-17, BD-18)', () => {
    // Manager can view any
    expect(policies.canViewProgressReport(managerUser, draftResource)).toBe(true);
    expect(policies.canViewProgressReport(managerUser, submittedResource)).toBe(true);

    // Engineer can view own only
    expect(policies.canViewProgressReport(engineerUser, draftResource)).toBe(true);
    expect(policies.canViewProgressReport(otherEngineer, draftResource)).toBe(false);

    // Accountant and Purchasing denied
    expect(policies.canViewProgressReport(accountantUser, draftResource)).toBe(false);
    expect(policies.canViewProgressReport(purchasingUser, draftResource)).toBe(false);
  });

  it('canListAllProgressReports allows MANAGER only', () => {
    expect(policies.canListAllProgressReports(managerUser)).toBe(true);
    expect(policies.canListAllProgressReports(engineerUser)).toBe(false);
  });

  it('canListEngineerProgressReports allows ENGINEER only', () => {
    expect(policies.canListEngineerProgressReports(engineerUser)).toBe(true);
    expect(policies.canListEngineerProgressReports(managerUser)).toBe(false);
  });
});
