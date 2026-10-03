/**
 * lib/budget/index.ts
 *
 * Public barrel export for the budget domain module.
 * Import budget functions from '@/lib/budget'.
 */

// Use cases
export { createBudgetDraft } from './use-cases/create-budget-draft';
export { updateBudgetDraft } from './use-cases/update-budget-draft';
export { submitBudget } from './use-cases/submit-budget';
export { approveBudget } from './use-cases/approve-budget';
export { rejectBudget } from './use-cases/reject-budget';
export { reopenBudgetDraft } from './use-cases/reopen-budget-draft';
export { getProjectBudget } from './use-cases/get-project-budget';

// Queries
export { hasApprovedBudget } from './queries/has-approved-budget';

// State machine utilities
export {
  canTransitionBudgetStatus,
  assertCanTransitionBudgetStatus,
  getAllowedNextBudgetStatuses,
} from './state-machine';

// Financial calculations
export {
  calculateBudgetLineExposure,
  isBudgetLineOverCeiling,
  calculateRemainingBudgetLineBalance,
  type BudgetLineActiveExposureResult,
  type CalculateBudgetLineExposureParams,
} from './calculations';

// Types
export type {
  BudgetStatus,
  BudgetCategory,
  BudgetLineDTO,
  BudgetSummaryDTO,
  BudgetDetailsDTO,
  BudgetUserInfo,
} from './types';

