/**
 * lib/variation-orders/index.ts
 *
 * Public entrypoint for the Variation Order / Change Order domain (Slice 20).
 *
 * Exposes:
 * - Domain calculations (exact Decimal)
 * - Deterministic state machine
 * - Query functions
 * - Server use cases
 * - Transformation mappers
 * - Type definitions
 *
 * Follows AGENTS.md §8, §13, §26.
 */

// Domain calculations
export {
  calculateLineFinancialDelta,
  calculateVariationOrderTotalImpact,
  calculateRevisedBudget,
  calculateRevisedBudgetLineCeiling,
  calculateEffectiveCommitmentCeiling,
  calculateProjectVariationsSummary,
  type LineCalculationResult,
  type ProjectVariationsSummaryResult,
} from './calculations';

// State machine
export {
  ALLOWED_VARIATION_ORDER_TRANSITIONS,
  canTransitionVariationOrderStatus,
  assertCanTransitionVariationOrderStatus,
  isVariationOrderEditable,
  isVariationOrderApproved,
  isVariationOrderTerminal,
} from './state-machine';

// Queries
export { getVariationOrder } from './queries/get-variation-order';
export {
  listVariationOrders,
  type ListVariationOrdersResult,
} from './queries/list-variation-orders';
export { getProjectVariationsSummary } from './queries/get-project-variations-summary';
export {
  getVariationFormData,
  type VariationFormProjectDTO,
} from './queries/get-variation-form-data';

// Use cases
export { createVariationOrder } from './use-cases/create-variation-order';
export { updateVariationOrder } from './use-cases/update-variation-order';
export { deleteVariationOrder } from './use-cases/delete-variation-order';
export { submitVariationOrder } from './use-cases/submit-variation-order';
export { approveVariationOrder } from './use-cases/approve-variation-order';
export { rejectVariationOrder } from './use-cases/reject-variation-order';
export { reopenVariationOrder } from './use-cases/reopen-variation-order';

// Mappers
export {
  toVariationOrderLineDTO,
  toVariationOrderSummaryDTO,
  toVariationOrderDetailDTO,
  toProjectVariationsSummaryDTO,
  type VariationOrderQueryRow,
} from './mappers';

// Types
export type {
  VariationOrderLineDTO,
  VariationOrderSummaryDTO,
  VariationOrderDetailDTO,
  ProjectVariationsSummaryDTO,
  ListVariationOrdersFilters,
} from './types';
