/**
 * lib/projects/index.ts
 *
 * Public barrel export for the projects domain module.
 * Import project functions from '@/lib/projects'.
 */

// Phase A use cases
export { createProject } from './use-cases/create-project';
export { listProjects } from './use-cases/list-projects';
export { getProject } from './use-cases/get-project';

// Phase B use cases
export { updateProject } from './use-cases/update-project';
export { changeProjectStatus } from './use-cases/change-project-status';
export { assignProjectManager } from './use-cases/assign-project-manager';

// State machine utilities (for UI — allowed next statuses)
export { getAllowedNextStatuses, canTransitionProjectStatus } from './state-machine';

export type {
  ProjectSummary,
  ProjectDetails,
  ProjectManagerInfo,
  ProjectStatus,
} from './types';
