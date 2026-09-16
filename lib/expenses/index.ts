/**
 * lib/expenses/index.ts
 *
 * Public barrel export for the expense domain module.
 * Import expense functions from '@/lib/expenses'.
 */

// Use cases
export { createExpenseDraft } from './use-cases/create-expense-draft';
export { updateExpenseDraft } from './use-cases/update-expense-draft';
export { deleteExpenseDraft } from './use-cases/delete-expense-draft';
export { submitExpense } from './use-cases/submit-expense';
export { approveExpense } from './use-cases/approve-expense';
export { rejectExpense } from './use-cases/reject-expense';
export { reopenExpenseDraft } from './use-cases/reopen-expense-draft';
export { getExpense } from './use-cases/get-expense';

// Queries
export { getProjectExpenses } from './queries/get-project-expenses';
export { getUserExpenses } from './queries/get-user-expenses';
export {
  getActiveProjectsForExpenses,
  type ActiveProjectForExpenseDTO,
} from './queries/get-active-projects-for-expenses';

// State machine utilities
export {
  canTransitionExpenseStatus,
  assertCanTransitionExpenseStatus,
  getAllowedNextExpenseStatuses,
  ALLOWED_EXPENSE_TRANSITIONS,
} from './state-machine';

// Types
export type {
  ExpenseStatus,
  ExpenseUserInfo,
  ExpenseBudgetLineInfo,
  ExpenseProjectInfo,
  ExpenseSummaryDTO,
  BudgetLineSpendDTO,
  ProjectExpensesOverviewDTO,
} from './types';
