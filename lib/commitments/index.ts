/**
 * lib/commitments/index.ts
 *
 * Public entry point for the Purchasing & Commitments module.
 *
 * Enforces AGENTS.md §26:
 * Server-only symbols are exposed here for use in Server Components,
 * Server Actions, and Route Handlers.
 *
 * For client components, import types directly from '@/lib/commitments/types'.
 */

// Types & DTOs
export * from './types';

// State Machine
export {
  ALLOWED_COMMITMENT_TRANSITIONS,
  canTransitionCommitmentStatus,
  assertCanTransitionCommitmentStatus,
  getAllowedNextCommitmentStatuses,
} from './state-machine';

// Mappers
export { toCommitmentSummaryDTO } from './mappers';

// Use Cases
export { createCommitmentDraft } from './use-cases/create-commitment-draft';
export { updateCommitmentDraft } from './use-cases/update-commitment-draft';
export { deleteCommitmentDraft } from './use-cases/delete-commitment-draft';
export { submitCommitment } from './use-cases/submit-commitment';
export { approveCommitment } from './use-cases/approve-commitment';
export { rejectCommitment } from './use-cases/reject-commitment';
export { reopenCommitment } from './use-cases/reopen-commitment';
export { getCommitment } from './use-cases/get-commitment';

// Queries
export { getProjectCommitments } from './queries/get-project-commitments';
export { getUserCommitments } from './queries/get-user-commitments';
export {
  getActiveProjectsForCommitments,
  type ActiveProjectForCommitmentDTO,
} from './queries/get-active-projects-for-commitments';
