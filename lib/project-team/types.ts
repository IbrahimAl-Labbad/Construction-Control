/**
 * lib/project-team/types.ts
 *
 * Domain and DTO types for Project Team & Engineer Assignment module.
 *
 * Presentation Layer Safety (AGENTS.md §6 & §26):
 * - All timestamps crossing server/client boundary are ISO 8601 strings (not Date objects).
 * - Decoupled from Prisma-generated enum types (uses safe domain string types).
 * - Zero exposure of credentials, password hashes, or session tokens.
 */

export type ProjectTeamAssignmentStatus = 'ACTIVE' | 'INACTIVE';

export type SafeProjectStatus =
  | 'PLANNED'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Safe, serialized representation of a project team member assignment.
 * Safe for direct consumption by React Server and Client Components.
 */
export interface ProjectTeamMemberDTO {
  assignmentId: string;
  projectId: string;
  engineerId: string;
  engineerName: string;
  engineerEmail: string;
  engineerIsActive: boolean;
  status: ProjectTeamAssignmentStatus;
  /// ISO 8601 string (e.g. "2026-09-24T12:00:00.000Z")
  assignedAt: string;
  assignedByName: string;
  /// ISO 8601 string or null
  removedAt: string | null;
  removedByName: string | null;
  removalReason: string | null;
}

/**
 * Dropdown candidate DTO for assigning/reactivating engineers.
 */
export interface AvailableEngineerOptionDTO {
  engineerId: string;
  engineerName: string;
  engineerEmail: string;
  isReassignmentCandidate: boolean;
}

/**
 * Operational assigned-project option for Site Engineers.
 */
export interface AssignedProjectOptionDTO {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: SafeProjectStatus;
  /// ISO 8601 string
  assignedAt: string;
}

/**
 * Mutation input contracts.
 */
export interface AssignEngineerInput {
  projectId: string;
  engineerId: string;
  reason?: string | null;
}

export interface RemoveEngineerInput {
  projectId: string;
  assignmentId: string;
  reason?: string | null;
}
