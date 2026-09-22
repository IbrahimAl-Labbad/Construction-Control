/**
 * lib/subcontractor-billings/index.ts
 *
 * Public entry point for the Subcontractor Billing module.
 *
 * Enforces AGENTS.md §26:
 * Server-only symbols (use-cases, calculations, queries) are exposed here
 * for use in Server Components, Server Actions, and Route Handlers.
 *
 * For client components, import types directly from:
 *   '@/lib/subcontractor-billings/types'
 *
 * For the state machine (client-safe), import directly from:
 *   '@/lib/subcontractor-billings/state-machine'
 */

// Types & DTOs (client-safe)
export * from './types';

// State Machine (client-safe)
export {
  ALLOWED_BILLING_TRANSITIONS,
  canTransitionBillingStatus,
  assertCanTransitionBillingStatus,
  getAllowedNextBillingStatuses,
} from './state-machine';

// Calculations (server-only — uses Prisma.Decimal)
export {
  calculateCumulativeCertified,
  checkBillingCeiling,
  type BillingCumulativeResult,
  type BillingCeilingCheckResult,
} from './calculations';

// Mappers
export {
  toSubcontractorBillingSummaryDTO,
  type SubcontractorBillingWithRelations,
} from './mappers';

// Use Cases (Phase 5)
export { createBillingDraft } from './use-cases/create-billing-draft';
export { updateBillingDraft } from './use-cases/update-billing-draft';
export { deleteBillingDraft } from './use-cases/delete-billing-draft';
export { submitBilling } from './use-cases/submit-billing';
export { approveBilling } from './use-cases/approve-billing';
export { rejectBilling } from './use-cases/reject-billing';
export { reopenBilling } from './use-cases/reopen-billing';
export { cancelBilling } from './use-cases/cancel-billing';
export { getBilling } from './use-cases/get-billing';

// Queries (Phase 6)
export { getProjectBillings } from './queries/get-project-billings';
export { getCommitmentBillings } from './queries/get-commitment-billings';

// Queries (Phase 8 — Form Data)
export {
  getBillingFormData,
  type BillingFormDataDTO,
  type BillingFormProject,
  type BillingFormCommitment,
  type BillingFormBudgetLine,
} from './queries/get-billing-form-data';

// Queries (Phase 8 — All Billings List)
export {
  getAllBillings,
  type AllBillingsResult,
} from './queries/get-all-billings';
