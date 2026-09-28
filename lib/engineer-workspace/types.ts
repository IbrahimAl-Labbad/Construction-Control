/**
 * lib/engineer-workspace/types.ts
 *
 * TypeScript types and DTO definitions for Site Engineer Workspace.
 * Vertical Slice 14 — Site Engineer Security & Scoped Field Operations.
 *
 * Strictly enforces:
 * - Zero financial amounts, budget totals, ceilings, or labor aggregates exposed to Site Engineers (BD-14-11).
 * - Read reuse of Milestones, Progress Reports, Expenses, and Custodies DTOs.
 */

import { ProjectStatus } from '@prisma/client';
import type { CustodySummaryDTO } from '@/lib/custodies/types';
import type { ExpenseSummaryDTO } from '@/lib/expenses/types';
import type { ProjectMilestoneDTO } from '@/lib/milestones/types';
import type { ProgressReportListItemDTO } from '@/lib/progress-reports/types';

export { ProjectStatus };

/**
 * Filter options for querying assigned projects for the engineer.
 */
export interface GetAssignedProjectsFilters {
  includeTerminal?: boolean;
}

/**
 * Summary card representation of an assigned project for the Site Engineer portfolio.
 */
export interface EngineerProjectCardDTO {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: ProjectStatus;
  assignedRole: string;
  assignedAt: string;
  milestonesCount: number;
  completedMilestonesCount: number;
  pendingExpensesCount: number;
  pendingCustodiesCount: number;
  latestReportDate: string | null;
}

/**
 * Stripped budget line category representation for Site Engineer forms (expenses/custodies).
 * Strictly contains NO amounts, budget ceilings, spent amounts, or financial totals (BD-14-11).
 */
export interface EngineerBudgetCategoryOptionDTO {
  id: string;
  category: string;
  description: string | null;
}

/**
 * Project header and operational details for the Engineer Project Workspace.
 */
export interface EngineerProjectDetailDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  assignedRole: string;
  assignedAt: string;
}

/**
 * Complete scoped workspace detail payload for an assigned Site Engineer.
 */
export interface EngineerWorkspaceDetailDTO {
  project: EngineerProjectDetailDTO;
  milestones: ProjectMilestoneDTO[];
  recentReports: ProgressReportListItemDTO[];
  recentExpenses: ExpenseSummaryDTO[];
  recentCustodies: CustodySummaryDTO[];
  availableBudgetCategories: EngineerBudgetCategoryOptionDTO[];
}
