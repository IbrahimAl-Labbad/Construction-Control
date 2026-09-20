/**
 * lib/custodies/index.ts
 *
 * Public barrel export for the Custody / Advance Payments & Settlement module.
 */

// Types & DTOs
export * from './types';

// State machine
export {
  VALID_CUSTODY_TRANSITIONS,
  canTransitionCustodyStatus,
  assertCanTransitionCustodyStatus,
} from './state-machine';

// Calculations
export {
  calculateCustodyBalances,
  calculateBudgetLineExposure,
} from './calculations';
export type {
  CustodyCalculatedBalances,
  BudgetLineActiveExposureResult,
} from './calculations';

// Mappers
export { toCustodySummaryDTO, toCustodyDetailDTO } from './mappers';

// Use Cases
export { createCustodyDraft } from './use-cases/create-custody-draft';
export { updateCustodyDraft } from './use-cases/update-custody-draft';
export { deleteCustodyDraft } from './use-cases/delete-custody-draft';
export { submitCustody } from './use-cases/submit-custody';
export { approveCustody } from './use-cases/approve-custody';
export { rejectCustody } from './use-cases/reject-custody';
export { reopenCustody } from './use-cases/reopen-custody';
export { cancelCustody } from './use-cases/cancel-custody';
export { issueCustody } from './use-cases/issue-custody';
export { recordCashReturn } from './use-cases/record-cash-return';
export { closeCustody } from './use-cases/close-custody';
export { getCustody } from './use-cases/get-custody';

// Queries
export {
  getProjectCustodies,
} from './queries/get-project-custodies';
export {
  getUserCustodies,
} from './queries/get-user-custodies';
export {
  getActiveProjectsForCustodies,
  type ActiveProjectForCustodyDTO,
  type CustodyFormDataDTO,
} from './queries/get-active-projects-for-custodies';
