/**
 * lib/engineer-workspace/mappers.ts
 *
 * Data transformation and sanitization mappers for Site Engineer Workspace.
 * Vertical Slice 14 — Site Engineer Security & Scoped Field Operations.
 *
 * Guarantees:
 * - Deterministic, sanitized projection of database records to client DTOs.
 * - Absolute omission of monetary quantities, budget ceilings, and financial aggregates (BD-14-11).
 */

import { MilestoneStatus } from '@prisma/client';
import type { ProjectStatus } from '@prisma/client';
import type {
  EngineerBudgetCategoryOptionDTO,
  EngineerProjectCardDTO,
  EngineerProjectDetailDTO,
} from './types';

export interface ProjectAssignmentCardEntity {
  assignedAt: Date;
  project: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    status: ProjectStatus;
    milestones: { id: string; status: MilestoneStatus }[];
    expenses: { id: string }[];
    custodies: { id: string }[];
    progressReports: { reportDate: Date }[];
  };
}

export function toEngineerProjectCardDTO(
  assignment: ProjectAssignmentCardEntity,
): EngineerProjectCardDTO {
  const p = assignment.project;
  const milestonesCount = p.milestones.length;
  const completedMilestonesCount = p.milestones.filter(
    (m) => m.status === MilestoneStatus.COMPLETED,
  ).length;

  return {
    id: p.id,
    code: p.code,
    name: p.name,
    location: p.location,
    status: p.status,
    assignedRole: 'مهندس موقع',
    assignedAt: assignment.assignedAt.toISOString(),
    milestonesCount,
    completedMilestonesCount,
    pendingExpensesCount: p.expenses.length,
    pendingCustodiesCount: p.custodies.length,
    latestReportDate: p.progressReports[0]?.reportDate
      ? p.progressReports[0].reportDate.toISOString().slice(0, 10)
      : null,
  };
}

export interface BudgetLineCategoryEntity {
  id: string;
  category: string;
  description: string | null;
}

export function toEngineerBudgetCategoryOptionDTO(
  line: BudgetLineCategoryEntity,
): EngineerBudgetCategoryOptionDTO {
  return {
    id: line.id,
    category: line.category,
    description: line.description,
  };
}

export interface ProjectDetailEntity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
}

export function toEngineerProjectDetailDTO(
  project: ProjectDetailEntity,
  assignment: { assignedAt: Date },
): EngineerProjectDetailDTO {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    location: project.location,
    status: project.status,
    startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
    endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : null,
    assignedRole: 'مهندس موقع',
    assignedAt: assignment.assignedAt.toISOString(),
  };
}
