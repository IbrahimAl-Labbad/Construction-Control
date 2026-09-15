/**
 * lib/projects/types.ts
 *
 * Domain and DTO types for the Project management module.
 * Pure types — no database or server-only dependencies.
 */

import type { ProjectStatus } from '@prisma/client';

export type { ProjectStatus };

/**
 * Basic manager info included in project responses.
 */
export type ProjectManagerInfo = {
  id: string;
  name: string;
  email: string;
};

/**
 * Safe summary representation of a project.
 */
export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  status: ProjectStatus;
  managerId: string;
  manager: ProjectManagerInfo;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Project details representation.
 */
export type ProjectDetails = ProjectSummary;
