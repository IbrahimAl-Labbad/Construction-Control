/**
 * lib/engineer-workspace/queries/get-engineer-project-workspace.ts
 *
 * Query: Fetches scoped operational workspace details for an assigned Site Engineer.
 * Vertical Slice 14 — Site Engineer Security & Scoped Field Operations.
 *
 * Enforces:
 * - Role.ENGINEER authorization (requireRole(Role.ENGINEER)).
 * - Input validation on projectId (projectIdSchema).
 * - Target project existence and non-deleted check -> AppError('NOT_FOUND') if missing.
 * - Active project assignment verification -> PermissionError('FORBIDDEN') if unassigned (IDOR defense).
 * - Read reuse of Milestones (getProjectMilestones).
 * - Read reuse of actor's own Progress Reports, Expenses, and Custodies.
 * - Absolute financial privacy: strips project budgets, category ceilings, spend totals, and labor costs.
 */

import { AssignmentStatus, BudgetStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError, requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/milestone';

import { toCustodySummaryDTO } from '@/lib/custodies/mappers';
import { toExpenseSummaryDTO } from '@/lib/expenses/mappers';
import { getProjectMilestones } from '@/lib/milestones';
import { PROGRESS_REPORT_INCLUDE, toProgressReportListItemDTO } from '@/lib/progress-reports/mappers';

import {
  toEngineerBudgetCategoryOptionDTO,
  toEngineerProjectDetailDTO,
} from '../mappers';
import type { EngineerWorkspaceDetailDTO } from '../types';

export async function getEngineerProjectWorkspace(
  projectIdInput: unknown,
): Promise<EngineerWorkspaceDetailDTO> {
  // 1. Role Authorization
  const actor = await requireRole(Role.ENGINEER);

  // 2. Validate projectId
  const idValidation = validate(projectIdSchema, projectIdInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const projectId = idValidation.data;

  // 3. Project Existence Check (non-deleted)
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      location: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 4. Active Assignment Verification (Unified 403 IDOR contract)
  const assignment = await prisma.projectAssignment.findFirst({
    where: {
      projectId,
      engineerId: actor.id,
      status: AssignmentStatus.ACTIVE,
    },
    select: {
      assignedAt: true,
    },
  });

  if (!assignment) {
    throw new PermissionError('FORBIDDEN', [Role.ENGINEER], actor.role);
  }

  // 5. Milestones (Read reuse of Slice 12 query)
  const milestones = await getProjectMilestones(projectId);

  // 6. Recent Progress Reports authored by this engineer on this project
  const reports = await prisma.progressReport.findMany({
    where: {
      projectId,
      createdById: actor.id,
      deletedAt: null,
    },
    include: PROGRESS_REPORT_INCLUDE,
    orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    take: 5,
  });

  // 7. Recent Expenses submitted by this engineer on this project
  const expenses = await prisma.expense.findMany({
    where: {
      projectId,
      submittedById: actor.id,
      deletedAt: null,
    },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // 8. Recent Custodies involving this engineer on this project (custodian or creator)
  const custodies = await prisma.custody.findMany({
    where: {
      projectId,
      OR: [{ custodianUserId: actor.id }, { createdById: actor.id }],
      deletedAt: null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      custodian: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, code: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      expenses: {
        where: { deletedAt: null },
        select: { id: true, amount: true, status: true, deletedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // 9. Available Budget Categories (ID & Category ONLY - strictly NO amounts, budgets, or balances)
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    include: {
      lines: {
        select: {
          id: true,
          category: true,
          description: true,
        },
        orderBy: { category: 'asc' },
      },
    },
  });

  const availableBudgetCategories = (approvedBudget?.lines ?? []).map(
    toEngineerBudgetCategoryOptionDTO,
  );

  return {
    project: toEngineerProjectDetailDTO(project, assignment),
    milestones,
    recentReports: reports.map(toProgressReportListItemDTO),
    recentExpenses: expenses.map(toExpenseSummaryDTO),
    recentCustodies: custodies.map(toCustodySummaryDTO),
    availableBudgetCategories,
  };
}
