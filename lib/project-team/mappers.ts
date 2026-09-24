/**
 * lib/project-team/mappers.ts
 *
 * Mappers and transformation utilities for Project Team & Assignment domain.
 * Ensures strict serialization (ISO 8601 strings) and privacy protection.
 */

import { Prisma } from '@prisma/client';
import type { AssignmentStatus, ProjectStatus } from '@prisma/client';
import type {
  ProjectTeamMemberDTO,
  ProjectTeamAssignmentStatus,
  AssignedProjectOptionDTO,
  SafeProjectStatus,
} from './types';

/**
 * Shape of ProjectAssignment with populated relations required for ProjectTeamMemberDTO.
 */
export type ProjectAssignmentWithRelations = {
  id: string;
  projectId: string;
  engineerId: string;
  status: AssignmentStatus;
  assignedAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
  engineer: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  };
  assignedBy: {
    name: string;
  };
  removedBy: {
    name: string;
  } | null;
};

/**
 * Shape of ProjectAssignment joined with project details for AssignedProjectOptionDTO.
 */
export type ProjectAssignmentWithProject = {
  assignedAt: Date;
  project: {
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
  };
};

/**
 * Maps a database ProjectAssignment record to a client-safe ProjectTeamMemberDTO.
 * Converts Date timestamps to ISO 8601 strings.
 */
export function toProjectTeamMemberDTO(
  assignment: ProjectAssignmentWithRelations,
): ProjectTeamMemberDTO {
  return {
    assignmentId: assignment.id,
    projectId: assignment.projectId,
    engineerId: assignment.engineerId,
    engineerName: assignment.engineer.name,
    engineerEmail: assignment.engineer.email,
    engineerIsActive: assignment.engineer.isActive,
    status: assignment.status as ProjectTeamAssignmentStatus,
    assignedAt: assignment.assignedAt.toISOString(),
    assignedByName: assignment.assignedBy.name,
    removedAt: assignment.removedAt ? assignment.removedAt.toISOString() : null,
    removedByName: assignment.removedBy ? assignment.removedBy.name : null,
    removalReason: assignment.removalReason,
  };
}

/**
 * Maps an assignment with project relation to AssignedProjectOptionDTO.
 * Converts Date timestamps to ISO 8601 strings.
 */
export function toAssignedProjectOptionDTO(
  assignment: ProjectAssignmentWithProject,
): AssignedProjectOptionDTO {
  return {
    projectId: assignment.project.id,
    projectCode: assignment.project.code,
    projectName: assignment.project.name,
    projectStatus: assignment.project.status as SafeProjectStatus,
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

/**
 * Identifies whether an error is a Prisma unique constraint violation on (projectId, engineerId).
 * Used as a targeted safety-net catch in assignment use cases.
 */
export function isProjectAssignmentUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('projectId') && target.includes('engineerId');
    }
    if (typeof target === 'string') {
      return target.includes('projectId') && target.includes('engineerId');
    }
  }
  return false;
}
