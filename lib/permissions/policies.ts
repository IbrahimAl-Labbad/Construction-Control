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

import { Role } from '@prisma/client';

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
} as const;
