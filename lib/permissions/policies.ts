/**
 * lib/permissions/policies.ts
 *
 * Fine-grained authorization policies.
 *
 * While guards.ts handles role-level access control,
 * policies.ts handles resource-level authorization:
 * "Can user X perform action Y on resource Z?"
 *
 * Policies are pure functions — they take a user and return a boolean.
 * They have no side effects and do not call the database.
 *
 * See AGENTS.md §6 for authorization principles.
 *
 * Future modules should add policies here as they are implemented.
 * Do not put authorization logic inside React components.
 *
 * Usage:
 *   import { policies } from '@/lib/permissions/policies';
 *   const canApprove = policies.canApproveExpense(user);
 */

import { Role, PayrollStatus, ProgressReportStatus } from '@prisma/client';

import type { AuthenticatedUser } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Policy type
// ---------------------------------------------------------------------------

/**
 * A policy function takes an authenticated user and returns a boolean.
 * Some policies also take the resource being acted upon.
 */
type Policy<TResource = void> = TResource extends void
  ? (user: AuthenticatedUser) => boolean
  : (user: AuthenticatedUser, resource: TResource) => boolean;

// ---------------------------------------------------------------------------
// General policies
// ---------------------------------------------------------------------------

/**
 * Whether the user is a Manager.
 */
const isManager: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can create new user accounts.
 * Only managers can create users (no public registration).
 */
const canCreateUser: Policy = (user) => isManager(user);

/**
 * Whether the user can deactivate another user's account.
 */
const canDeactivateUser: Policy = (user) => isManager(user);

/**
 * Whether the user can view their own profile.
 * All authenticated users can see their own profile.
 */
const canViewOwnProfile: Policy = (_user) => true;

// ---------------------------------------------------------------------------
// Expense policies (Vertical Slice 4)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create, edit, delete, or submit an expense claim.
 * In v1, restricted to Site Engineers and Accountants.
 */
const canSubmitExpense: Policy = (user) =>
  user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

const canManageExpenseDraft: Policy = (user) =>
  user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

/**
 * Whether the user can approve or reject an expense claim.
 * Only managers have final approval authority.
 */
const canApproveExpense: Policy = (user) => isManager(user);

/**
 * Whether the user can view expenses.
 * Managers, Engineers, and Accountants can view expenses.
 * Purchasing has no access to expenses.
 */
const canViewExpenses: Policy = (user) =>
  isManager(user) || user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

// ---------------------------------------------------------------------------
// Commitment policies (Vertical Slice 5)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create, edit, delete, or submit a commitment draft.
 * In v1, restricted EXCLUSIVELY to Role.PURCHASING.
 * Engineers, Accountants, and Managers cannot create commitments.
 */
const canCreateCommitment: Policy = (user) => user.role === Role.PURCHASING;

const canManageCommitmentDraft: Policy = (user) => user.role === Role.PURCHASING;

const canSubmitCommitment: Policy = (user) => user.role === Role.PURCHASING;

/**
 * Whether the user can approve or reject a commitment.
 * Only managers have final approval authority.
 */
const canApproveCommitment: Policy = (user) => isManager(user);

const canRejectCommitment: Policy = (user) => isManager(user);

/**
 * Whether the user can view commitments.
 * All active authenticated users can view commitments according to their scope.
 */
const canViewCommitments: Policy = (user) => user.isActive;

// ---------------------------------------------------------------------------
// Custody policies (Vertical Slice 6)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create, edit, delete, or submit a custody request.
 * In v1, restricted to Site Engineers and Accountants.
 */
const canCreateCustody: Policy = (user) =>
  user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

const canManageCustodyDraft: Policy = (user) =>
  user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

const canSubmitCustody: Policy = (user) =>
  user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

/**
 * Whether the user can approve, reject, or cancel an approved custody request.
 * Only managers have approval and cancellation authority.
 */
const canApproveCustody: Policy = (user) => isManager(user);
const canRejectCustody: Policy = (user) => isManager(user);
const canCancelCustody: Policy = (user) => isManager(user);

/**
 * Whether the user can disburse cash for an approved custody or record cash return.
 * Restricted to Accountants.
 */
const canIssueCustody: Policy = (user) => user.role === Role.ACCOUNTANT;
const canRecordCashReturn: Policy = (user) => user.role === Role.ACCOUNTANT;

/**
 * Whether the user can execute final administrative closure of a settled custody.
 * Restricted to Managers.
 */
const canCloseCustody: Policy = (user) => isManager(user);

/**
 * Whether the user can view custodies.
 * All active users can view according to their operational scope.
 */
const canViewCustodies: Policy = (user) => user.isActive;

// ---------------------------------------------------------------------------
// Subcontractor Billing policies (Vertical Slice 7)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create a subcontractor billing draft.
 * Restricted exclusively to Accountants.
 * Coarse-grained role check only — object-level ownership is enforced
 * inside the use-cases (e.g. Accountant can only edit their own draft).
 */
const canCreateBilling: Policy = (user) => user.role === Role.ACCOUNTANT;

/**
 * Whether the user can edit or delete a subcontractor billing draft.
 * Restricted exclusively to Accountants.
 * Object-level rule: only the Accountant who created the draft may manage it.
 * That check lives in update-billing-draft.ts and delete-billing-draft.ts.
 */
const canManageBillingDraft: Policy = (user) => user.role === Role.ACCOUNTANT;

/**
 * Whether the user can submit a billing draft for Manager approval.
 * Restricted exclusively to Accountants.
 */
const canSubmitBilling: Policy = (user) => user.role === Role.ACCOUNTANT;

/**
 * Whether the user can approve a submitted billing claim.
 * Only managers have final certification authority.
 * Object-level rule: self-approval is forbidden — enforced in approve-billing.ts.
 */
const canApproveBilling: Policy = (user) => isManager(user);

/**
 * Whether the user can reject a submitted billing claim.
 * Only managers have rejection authority.
 */
const canRejectBilling: Policy = (user) => isManager(user);

/**
 * Whether the user can cancel a DRAFT or SUBMITTED billing.
 * Only managers can cancel. APPROVED billings cannot be cancelled.
 * That state guard lives in cancel-billing.ts.
 */
const canCancelBilling: Policy = (user) => isManager(user);

/**
 * Whether the user can view subcontractor billings.
 * Managers, Engineers, and Accountants have read access.
 * Purchasing has no access to subcontractor billing data.
 */
const canViewBillings: Policy = (user) =>
  isManager(user) || user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;

// ---------------------------------------------------------------------------
// Variation Order policies (Vertical Slice 20)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create a variation order draft.
 * Restricted to active Site Engineers.
 */
const canCreateVariationOrder: Policy = (user) => user.isActive && user.role === Role.ENGINEER;

/**
 * Whether the user can edit or delete a variation order draft.
 * Restricted to active Site Engineers.
 * Object-level: only creator may edit their own draft.
 */
const canManageVariationOrderDraft: Policy<{ createdById?: string }> = (
  user,
  resource,
) =>
  user.isActive &&
  user.role === Role.ENGINEER &&
  (!resource?.createdById || resource.createdById === user.id);

/**
 * Whether the user can submit a variation order draft.
 * Restricted to active Site Engineers (creator only).
 */
const canSubmitVariationOrder: Policy<{ createdById?: string }> = (
  user,
  resource,
) =>
  user.isActive &&
  user.role === Role.ENGINEER &&
  (!resource?.createdById || resource.createdById === user.id);

/**
 * Whether the user can approve a submitted variation order.
 * Restricted to active Managers.
 * Separation of duties: creator or submitter cannot approve.
 */
const canApproveVariationOrder: Policy<{ createdById?: string; submittedById?: string | null }> = (
  user,
  resource,
) =>
  user.isActive &&
  isManager(user) &&
  (!resource ||
    (resource.createdById !== user.id && resource.submittedById !== user.id));

/**
 * Whether the user can reject a submitted variation order.
 * Restricted to active Managers.
 */
const canRejectVariationOrder: Policy = (user) => user.isActive && isManager(user);

/**
 * Whether the user can reopen a rejected variation order to draft.
 * Restricted to active Site Engineers (creator only).
 */
const canReopenVariationOrder: Policy<{ createdById?: string }> = (
  user,
  resource,
) =>
  user.isActive &&
  user.role === Role.ENGINEER &&
  (!resource?.createdById || resource.createdById === user.id);

/**
 * Whether the user can view variation orders.
 * All active authenticated users have read access within their project scope.
 */
const canViewVariationOrders: Policy = (user) => user.isActive;

// ---------------------------------------------------------------------------
// Future financial policies (stubs — to be populated in feature tasks)
// ---------------------------------------------------------------------------

// These stubs document the expected shape of future policies.
// They return false by default to enforce "deny by default" (AGENTS.md §6).

/**
 * Whether the user can create a purchase request.
 * Purchasing officers create purchase requests.
 * @stub — implement in purchasing feature task
 */
const canCreatePurchaseRequest: Policy = (user) =>
  user.role === Role.PURCHASING;

/**
 * Whether the user can approve a purchase request.
 * Only managers approve purchase requests.
 * @stub — implement in purchasing feature task
 */
const canApprovePurchaseRequest: Policy = (user) => isManager(user);

// ---------------------------------------------------------------------------
// Budget policies (Vertical Slice 3)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create, update, submit, approve, or reject budgets.
 * In v1, this is restricted exclusively to Role.MANAGER.
 */
const canManageBudget: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can view a project budget.
 * In v1, all authenticated active users can view budgets.
 */
const canViewBudget: Policy = (user) => user.isActive;

// ---------------------------------------------------------------------------
// Payroll policies (Vertical Slice 8)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create a payroll draft entry.
 * In v1, restricted exclusively to active Accountants (AGENTS.md §5.3).
 * Managers, Engineers, and Purchasing Officers cannot create payroll entries.
 */
export const canCreatePayrollDraft = (user: AuthenticatedUser): boolean => {
  if (!user.isActive) return false;
  return user.role === Role.ACCOUNTANT;
};

/**
 * Whether the user can edit or delete a payroll draft entry.
 * Restricted to active Accountants who own (created) the draft while in DRAFT status.
 * Managers cannot edit or delete payroll entries (separation of duties).
 */
export const canManagePayrollDraft = (
  user: AuthenticatedUser,
  entry: { createdById: string; status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;
  if (user.role !== Role.ACCOUNTANT) return false;
  if (entry.status !== PayrollStatus.DRAFT) return false;
  return entry.createdById === user.id;
};

/**
 * Whether the user can submit a payroll draft for Manager approval.
 * Restricted to the active Accountant who created the entry while in DRAFT status.
 */
export const canSubmitPayroll = (
  user: AuthenticatedUser,
  entry: { createdById: string; status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;
  if (user.role !== Role.ACCOUNTANT) return false;
  if (entry.status !== PayrollStatus.DRAFT) return false;
  return entry.createdById === user.id;
};

/**
 * Whether the user can approve a submitted payroll entry.
 * Restricted to active Managers while entry is in SUBMITTED status.
 * Strict separation of duties: creator cannot approve their own entry (createdById !== user.id).
 * Accountants, Engineers, and Purchasing officers cannot approve.
 */
export const canApprovePayroll = (
  user: AuthenticatedUser,
  entry: { createdById: string; status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;
  if (user.role !== Role.MANAGER) return false;
  if (entry.status !== PayrollStatus.SUBMITTED) return false;
  return entry.createdById !== user.id;
};

/**
 * Whether the user can reject a submitted payroll entry back to Accountant.
 * Restricted to active Managers while entry is in SUBMITTED status.
 */
export const canRejectPayroll = (
  user: AuthenticatedUser,
  entry: { status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;
  if (user.role !== Role.MANAGER) return false;
  return entry.status === PayrollStatus.SUBMITTED;
};

/**
 * Whether the user can reopen a rejected payroll entry for corrections.
 * Restricted to the active Accountant who originally created the entry while in REJECTED status.
 * Managers or other accountants cannot reopen it.
 */
export const canReopenPayroll = (
  user: AuthenticatedUser,
  entry: { createdById: string; status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;
  if (user.role !== Role.ACCOUNTANT) return false;
  if (entry.status !== PayrollStatus.REJECTED) return false;
  return entry.createdById === user.id;
};

/**
 * Whether the user can cancel a payroll entry.
 * Matrix:
 * - DRAFT: Accountant creator OR Manager can cancel.
 * - SUBMITTED: Manager ONLY can cancel.
 * - REJECTED: Denied for all.
 * - APPROVED: Denied for all (strictly immutable ledger record).
 * - CANCELLED: Denied for all (terminal state).
 */
export const canCancelPayroll = (
  user: AuthenticatedUser,
  entry: { createdById: string; status: PayrollStatus },
): boolean => {
  if (!user.isActive) return false;

  if (entry.status === PayrollStatus.DRAFT) {
    if (user.role === Role.ACCOUNTANT && entry.createdById === user.id) {
      return true;
    }
    if (user.role === Role.MANAGER) {
      return true;
    }
    return false;
  }

  if (entry.status === PayrollStatus.SUBMITTED) {
    return user.role === Role.MANAGER;
  }

  // REJECTED, APPROVED, CANCELLED cannot be cancelled
  return false;
};

/**
 * Whether the user can view detailed payroll entries.
 * Restricted to active Managers and Accountants.
 * Engineers and Purchasing Officers are strictly denied.
 */
export const canViewPayrollDetails = (user: AuthenticatedUser): boolean => {
  if (!user.isActive) return false;
  return user.role === Role.MANAGER || user.role === Role.ACCOUNTANT;
};

/**
 * Whether the user can view aggregate project labor cost summaries.
 * - Manager: ALLOW (active user).
 * - Accountant: ALLOW (active user).
 * - Purchasing: HARD DENY (false).
 * - Engineer: FAIL-CLOSED. Allowed ONLY if a validated safe project-scope mechanism
 *   proves the engineer is assigned to or has verified access to the specific project.
 *   If scope is omitted or unverified, returns false.
 */
export const canViewProjectLaborAggregate = (
  user: AuthenticatedUser,
  scopeResolution?: { hasProjectAccess?: boolean; isAssignedEngineer?: boolean } | boolean,
): boolean => {
  if (!user.isActive) return false;

  if (user.role === Role.MANAGER || user.role === Role.ACCOUNTANT) {
    return true;
  }

  if (user.role === Role.PURCHASING) {
    return false;
  }

  if (user.role === Role.ENGINEER) {
    if (typeof scopeResolution === 'boolean') {
      return scopeResolution;
    }
    if (scopeResolution && typeof scopeResolution === 'object') {
      return Boolean(scopeResolution.hasProjectAccess || scopeResolution.isAssignedEngineer);
    }
    return false; // Fail closed
  }

  return false;
};

// ---------------------------------------------------------------------------
// Executive Dashboard policies (Vertical Slice 9)
// ---------------------------------------------------------------------------

/**
 * Whether the user can view the executive dashboard.
 *
 * Restricted exclusively to active Managers (BD-02).
 * AGENTS.md §5.1: Manager is the primary consumer of management visibility.
 *
 * Denied for:
 * - Accountant (payroll aggregate exposure risk)
 * - Engineer (fail-closed)
 * - Purchasing (denied)
 * - Inactive users of any role
 */
const canViewExecutiveDashboard: Policy = (user) =>
  user.isActive && user.role === Role.MANAGER;

// ---------------------------------------------------------------------------
// Progress Report Policies (Vertical Slice 10)
// ---------------------------------------------------------------------------

/**
 * Minimal progress report resource shape for policy evaluation.
 */
interface ProgressReportResource {
  id: string;
  status: ProgressReportStatus;
  createdById: string;
}

/**
 * Whether the user can create a progress report draft.
 * Role.ENGINEER only (BD-02).
 */
const canCreateProgressReport: Policy = (user) => user.role === Role.ENGINEER;

/**
 * Whether the user can update/manage a progress report draft.
 * Only the creating Engineer while in DRAFT status (BD-07).
 */
const canManageProgressReportDraft: Policy<ProgressReportResource> = (user, report) => {
  if (user.role !== Role.ENGINEER) return false;
  return report.status === ProgressReportStatus.DRAFT && report.createdById === user.id;
};

/**
 * Whether the user can submit a progress report for review.
 * Only the creating Engineer while in DRAFT status.
 */
const canSubmitProgressReport: Policy<ProgressReportResource> = (user, report) => {
  if (user.role !== Role.ENGINEER) return false;
  return report.status === ProgressReportStatus.DRAFT && report.createdById === user.id;
};

/**
 * Whether the user can approve a submitted progress report.
 * Role.MANAGER only (BD-06).
 */
const canApproveProgressReport: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can reject a submitted progress report.
 * Role.MANAGER only (BD-06).
 */
const canRejectProgressReport: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can reopen a rejected progress report.
 * Only the creating Engineer while in REJECTED status (BD-06, BD-07).
 */
const canReopenProgressReport: Policy<ProgressReportResource> = (user, report) => {
  if (user.role !== Role.ENGINEER) return false;
  return report.status === ProgressReportStatus.REJECTED && report.createdById === user.id;
};

/**
 * Whether the user can cancel a progress report.
 * Engineer can cancel own DRAFT. Manager can cancel DRAFT or SUBMITTED (BD-08).
 */
const canCancelProgressReport: Policy<ProgressReportResource> = (user, report) => {
  if (user.role === Role.ENGINEER) {
    return report.status === ProgressReportStatus.DRAFT && report.createdById === user.id;
  }
  if (user.role === Role.MANAGER) {
    return (
      report.status === ProgressReportStatus.DRAFT ||
      report.status === ProgressReportStatus.SUBMITTED
    );
  }
  return false;
};

/**
 * Whether the user can view a specific progress report.
 * Manager can view any report. Engineer can view own report only (BD-16, BD-17, BD-18).
 * Accountant and Purchasing are denied.
 */
const canViewProgressReport: Policy<ProgressReportResource> = (user, report) => {
  if (user.role === Role.MANAGER) return true;
  if (user.role === Role.ENGINEER) return report.createdById === user.id;
  return false;
};

/**
 * Whether the user can view the global progress reports list.
 * Role.MANAGER only (BD-17, BD-20).
 */
const canListAllProgressReports: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can view their own progress reports list.
 * Role.ENGINEER only (BD-18).
 */
const canListEngineerProgressReports: Policy = (user) => user.role === Role.ENGINEER;

/**
 * Whether the user can view progress reports for a specific project.
 * Role.MANAGER only.
 */
const canListProjectProgressReports: Policy = (user) => user.role === Role.MANAGER;

// ---------------------------------------------------------------------------
// Project Team & Assignment Policies (Vertical Slice 11)
// ---------------------------------------------------------------------------

/**
 * Whether the user can assign or remove engineers from a project.
 * Restricted to active Managers (BD-11-02).
 */
const canManageProjectTeam: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can view the project team list.
 * Restricted to active Managers.
 */
const canViewProjectTeam: Policy = (user) => user.role === Role.MANAGER;

/**
 * Whether the user can view assigned projects for an engineer.
 * Allowed for Managers, or the Engineer viewing their own assignments.
 */
const canViewAssignedProjects = (
  user: AuthenticatedUser,
  targetEngineerId: string,
): boolean => {
  if (!user.isActive) return false;
  if (user.role === Role.MANAGER) return true;
  return user.role === Role.ENGINEER && user.id === targetEngineerId;
};

// ---------------------------------------------------------------------------
// Project Planning & Milestones Policies (Vertical Slice 12)
// ---------------------------------------------------------------------------

/**
 * Whether the user can create, update, start, complete, cancel, reorder, or delete milestones.
 * Restricted to active Managers (BD-12-01).
 */
export const canManageMilestones: Policy = (user) => user.isActive && user.role === Role.MANAGER;

/**
 * Whether the user can view project milestones (BD-12-02, BD-12-03, BD-12-04).
 * - Manager: ALLOW
 * - Accountant: ALLOW (View-only)
 * - Purchasing: ALLOW (View-only)
 * - Engineer: ALLOW ONLY IF active project assignment exists (BD-12-02)
 */
export const canViewProjectMilestones = (
  user: AuthenticatedUser,
  isAssignedEngineer: boolean = false,
): boolean => {
  if (!user.isActive) return false;
  if (user.role === Role.MANAGER || user.role === Role.ACCOUNTANT || user.role === Role.PURCHASING) {
    return true;
  }
  if (user.role === Role.ENGINEER) {
    return isAssignedEngineer;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Policies namespace export
// ---------------------------------------------------------------------------

/**
 * All authorization policies for the application.
 *
 * Use these in Server Components, Server Actions, and API routes
 * after the user has been authenticated via requireAuth() or requireRole().
 *
 * NEVER use these as the sole access control mechanism on the client.
 *
 * @example
 * const user = await requireAuth();
 * if (!policies.canApproveExpense(user)) {
 *   throw new PermissionError('FORBIDDEN', [Role.MANAGER], user.role);
 * }
 */
export const policies = {
  // User management
  isManager,
  canCreateUser,
  canDeactivateUser,
  canViewOwnProfile,

  // Budget management (Vertical Slice 3)
  canManageBudget,
  canViewBudget,

  // Expense management (Vertical Slice 4)
  canSubmitExpense,
  canManageExpenseDraft,
  canApproveExpense,
  canViewExpenses,

  // Commitment management (Vertical Slice 5)
  canCreateCommitment,
  canManageCommitmentDraft,
  canSubmitCommitment,
  canApproveCommitment,
  canRejectCommitment,
  canViewCommitments,

  // Custody management (Vertical Slice 6)
  canCreateCustody,
  canManageCustodyDraft,
  canSubmitCustody,
  canApproveCustody,
  canRejectCustody,
  canCancelCustody,
  canIssueCustody,
  canRecordCashReturn,
  canCloseCustody,
  canViewCustodies,

  // Purchasing (stubs)
  canCreatePurchaseRequest,
  canApprovePurchaseRequest,

  // Subcontractor Billing management (Vertical Slice 7)
  canCreateBilling,
  canManageBillingDraft,
  canSubmitBilling,
  canApproveBilling,
  canRejectBilling,
  canCancelBilling,
  canViewBillings,

  // Payroll management (Vertical Slice 8)
  canCreatePayrollDraft,
  canManagePayrollDraft,
  canSubmitPayroll,
  canApprovePayroll,
  canRejectPayroll,
  canReopenPayroll,
  canCancelPayroll,
  canViewPayrollDetails,
  canViewProjectLaborAggregate,

  // Executive Dashboard (Vertical Slice 9)
  canViewExecutiveDashboard,

  // Progress Reports (Vertical Slice 10)
  canCreateProgressReport,
  canManageProgressReportDraft,
  canSubmitProgressReport,
  canApproveProgressReport,
  canRejectProgressReport,
  canReopenProgressReport,
  canCancelProgressReport,
  canViewProgressReport,
  canListAllProgressReports,
  canListEngineerProgressReports,
  canListProjectProgressReports,

  // Project Team & Assignment (Vertical Slice 11)
  canManageProjectTeam,
  canViewProjectTeam,
  canViewAssignedProjects,

  // Project Planning & Milestones (Vertical Slice 12)
  canManageMilestones,
  canViewProjectMilestones,

  // Variation Orders (Vertical Slice 20)
  canCreateVariationOrder,
  canManageVariationOrderDraft,
  canSubmitVariationOrder,
  canApproveVariationOrder,
  canRejectVariationOrder,
  canReopenVariationOrder,
  canViewVariationOrders,
} as const;

