/**
 * lib/operational-dashboard/use-cases/get-project-operational-dashboard.ts
 *
 * Authoritative use case for retrieving the Operational Project Dashboard.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strict Architectural Invariants (AGENTS.md §6, §7, BD-13-01 to BD-13-20):
 * - Phase 1: Security Entry Guard:
 *   - Verifies server-side Manager role via requireManager().
 *   - Verifies project exists and is not soft-deleted (deletedAt === null).
 * - Phase 2: Concurrent Domain Retrieval via Promise.all():
 *   - [A] getProject(projectId) (Slice 2)
 *   - [B] getLatestProjectProgressReport(projectId) (Slice 13 dedicated snapshot)
 *   - [C] getProjectMilestoneSummary(projectId) (Slice 12 as-is)
 *   - [D] getActiveProjectEngineerCount(projectId) (Slice 11 as-is)
 *   - [E] getProjectOperationalFinancialSummary(projectId) (Slice 13 financial read model)
 * - ZERO financial Prisma queries in this orchestrator (complete ownership in Branch E).
 * - ZERO AuditLog records generated (reads produce no audit events per BD-13-19).
 * - Returns clean OperationalProjectDashboardDTO (no managerId, no Prisma objects).
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project';

import { getProject } from '@/lib/projects/use-cases/get-project';
import { getLatestProjectProgressReport } from '../queries/get-latest-project-progress-report';
import { getProjectMilestoneSummary } from '@/lib/milestones/queries/get-project-milestone-summary';
import { getActiveProjectEngineerCount } from '@/lib/project-team/queries/get-active-project-engineer-count';
import { getProjectOperationalFinancialSummary } from '../queries/get-project-operational-financial-summary';

import { toOperationalProjectDashboardDTO } from '../mappers';
import type { OperationalProjectDashboardDTO } from '../types';

/**
 * Orchestrates the retrieval of the operational project dashboard.
 *
 * @param projectIdInput - Untrusted project identifier input
 * @returns Fully serialized OperationalProjectDashboardDTO
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if user is not an active Manager
 * @throws {ValidationError} if projectId is invalid
 * @throws {AppError} NOT_FOUND if project does not exist or is soft-deleted
 */
export async function getProjectOperationalDashboard(
  projectIdInput: unknown,
): Promise<OperationalProjectDashboardDTO> {
  const generatedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Validation: Validate projectId
  // ---------------------------------------------------------------------------
  const validation = validate(projectIdSchema, projectIdInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const projectId = validation.data;

  // ---------------------------------------------------------------------------
  // Phase 1: Security Entry Guard
  // ---------------------------------------------------------------------------
  await requireManager();

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Concurrent Domain Retrieval via Promise.all across 5 domain branches
  // ---------------------------------------------------------------------------
  const [
    identityProject,
    latestProgress,
    milestoneSummary,
    activeEngineerCount,
    financialSummary,
  ] = await Promise.all([
    getProject(projectId),
    getLatestProjectProgressReport(projectId),
    getProjectMilestoneSummary(projectId),
    getActiveProjectEngineerCount(projectId),
    getProjectOperationalFinancialSummary(projectId),
  ]);

  // ---------------------------------------------------------------------------
  // Phase 3: DTO Assembly
  // ---------------------------------------------------------------------------
  return toOperationalProjectDashboardDTO({
    projectId,
    generatedAt,
    identityProject,
    latestProgress,
    milestoneSummary,
    activeEngineerCount,
    financialSummary,
  });
}
