/**
 * lib/payroll/index.ts
 *
 * Public entry point for the Payroll Data Entry / Labor Cost Control module.
 *
 * Enforces AGENTS.md §26:
 * Server-only symbols (calculations, use-cases, queries) are exposed here
 * for use in Server Components, Server Actions, and Route Handlers.
 *
 * For client components, import types directly from:
 *   '@/lib/payroll/types'
 *
 * For the state machine (client-safe), import directly from:
 *   '@/lib/payroll/state-machine'
 */

// Types & DTOs (client-safe)
export * from './types';

// State Machine (client-safe)
export {
  ALLOWED_PAYROLL_TRANSITIONS,
  canTransitionPayrollStatus,
  assertValidPayrollTransition,
  getAllowedNextPayrollStatuses,
  isEditablePayrollStatus,
  isTerminalPayrollStatus,
  assertPayrollIsEditable,
  assertPayrollCanBeApproved,
  assertPayrollCanBeRejected,
  assertPayrollCanBeCancelled,
} from './state-machine';

// Calculations & Domain Invariants (server-only — uses Prisma.Decimal)
export {
  normalizePayrollWorkerName,
  buildPayrollDuplicateKey,
  calculateApprovedPayrollTotal,
  calculatePendingPayrollTotal,
  calculatePeriodLaborCost,
  calculateProjectLaborCost,
  calculateRemainingLaborBudget,
  calculateProjectLaborSummary,
  assertValidPayrollPeriod,
  assertPositivePayrollAmount,
  assertSARCurrency,
  checkPayrollBudgetLineCeiling,
  type ProjectLaborCalculationResult,
  type PayrollCeilingCheckResult,
} from './calculations';

// Mappers
export {
  PAYROLL_INCLUDE,
  formatArabicPayrollPeriod,
  toPayrollDetailDTO,
  toPayrollSummaryDTO,
  toPayrollListItemDTO,
  toProjectLaborSummaryDTO,
  toPayrollFormDataDTO,
  type PayrollEntryWithRelations,
  type RawProjectLaborSummaryInput,
  type RawPayrollFormDataProject,
} from './mappers';

// Queries
export {
  getBudgetLinePayrollExposure,
  type BudgetLinePayrollExposureResult,
} from './queries/get-budget-line-payroll-exposure';
export { getAllPayrollEntries } from './queries/get-all-payroll-entries';
export {
  getProjectPayrollEntries,
  type GetProjectPayrollEntriesFilters,
} from './queries/get-project-payroll-entries';
export { getProjectLaborSummary } from './queries/get-project-labor-summary';
export { getPayrollFormData } from './queries/get-payroll-form-data';

// Use Cases
export { approvePayroll } from './use-cases/approve-payroll';
export { createPayrollDraft } from './use-cases/create-payroll-draft';
export { updatePayrollDraft } from './use-cases/update-payroll-draft';
export { deletePayrollDraft, type DeletePayrollDraftResult } from './use-cases/delete-payroll-draft';
export { submitPayroll } from './use-cases/submit-payroll';
export { rejectPayroll } from './use-cases/reject-payroll';
export { reopenPayroll } from './use-cases/reopen-payroll';
export { cancelPayroll } from './use-cases/cancel-payroll';
export { getPayrollEntry } from './use-cases/get-payroll-entry';

