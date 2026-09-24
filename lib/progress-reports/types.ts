/**
 * lib/progress-reports/types.ts
 *
 * Domain types and DTO interfaces for Site Engineer Progress Reports.
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 *
 * Boundary rules:
 * - No Prisma model types leak across the server/client DTO boundary.
 * - No Date objects cross the DTO boundary (reportDate is YYYY-MM-DD string, timestamps are ISO-8601 strings).
 * - ReportActorInfo contains only { id, name } — no email, no credentials (BD-21).
 * - No submittedBy / submittedById — submitter is always createdById.
 * - Zero financial data fields (BD-12).
 */

import { ProgressReportStatus } from '@prisma/client';

export { ProgressReportStatus };

// ---------------------------------------------------------------------------
// Actor DTO (Privacy Preserving — BD-21)
// ---------------------------------------------------------------------------

export interface ReportActorInfo {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Project Reference DTO
// ---------------------------------------------------------------------------

export interface ProgressReportProjectInfo {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Progress Report List Item DTO (Reduced View for Tables / Cards)
// ---------------------------------------------------------------------------

export interface ProgressReportListItemDTO {
  id: string;
  projectId: string;
  project?: ProgressReportProjectInfo | undefined;
  reportDate: string; // YYYY-MM-DD
  title: string;
  progressPercentage: number | null;
  status: ProgressReportStatus;
  createdById: string;
  createdBy?: ReportActorInfo | undefined;
  createdAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Progress Report Detail DTO (Full View)
// ---------------------------------------------------------------------------

export interface ProgressReportDetailDTO {
  id: string;
  projectId: string;
  project?: ProgressReportProjectInfo | undefined;
  reportDate: string; // YYYY-MM-DD
  title: string;
  workDescription: string;
  progressPercentage: number | null;
  blockers: string | null;
  nextPeriodPlan: string | null;
  weatherCondition: string | null;
  status: ProgressReportStatus;

  // Creator
  createdById: string;
  createdBy?: ReportActorInfo | undefined;

  // Submission
  submittedAt: string | null; // ISO-8601

  // Approval
  approvedById: string | null;
  approvedBy?: ReportActorInfo | null | undefined;
  approvedAt: string | null; // ISO-8601

  // Rejection
  rejectedById: string | null;
  rejectedBy?: ReportActorInfo | null | undefined;
  rejectedAt: string | null; // ISO-8601
  rejectionReason: string | null;

  // Cancellation
  cancelledById: string | null;
  cancelledBy?: ReportActorInfo | null | undefined;
  cancelledAt: string | null; // ISO-8601
  cancellationReason: string | null;

  // Audit Timestamps
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Active Project Option DTO (for Engineer Project Dropdown — BD-03 Model C)
// ---------------------------------------------------------------------------

export interface ActiveProjectOptionDTO {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Filter Types
// ---------------------------------------------------------------------------

export interface ProgressReportFilters {
  projectId?: string | undefined;
  status?: ProgressReportStatus | undefined;
}

// ---------------------------------------------------------------------------
// Use Case Inputs
// ---------------------------------------------------------------------------

export interface CreateProgressReportInput {
  projectId: string;
  reportDate: string | Date;
  title: string;
  workDescription: string;
  progressPercentage?: number | null | undefined;
  blockers?: string | null | undefined;
  nextPeriodPlan?: string | null | undefined;
  weatherCondition?: string | null | undefined;
}

export interface UpdateProgressReportInput {
  title?: string | undefined;
  workDescription?: string | undefined;
  progressPercentage?: number | null | undefined;
  blockers?: string | null | undefined;
  nextPeriodPlan?: string | null | undefined;
  weatherCondition?: string | null | undefined;
}

export interface RejectProgressReportInput {
  rejectionReason?: string | null | undefined;
}

export interface CancelProgressReportInput {
  cancellationReason?: string | null | undefined;
}
