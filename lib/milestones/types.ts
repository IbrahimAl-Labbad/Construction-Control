/**
 * lib/milestones/types.ts
 *
 * TypeScript types and DTO definitions for Project Milestones.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Strictly typed — zero `any`, zero leaky Prisma entities across client boundary.
 */

import { MilestoneStatus } from '@prisma/client';

export { MilestoneStatus };

export interface ProjectMilestoneDTO {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  targetDate: string;           // "YYYY-MM-DD"
  achievedAt: string | null;     // ISO-8601 string or null
  status: MilestoneStatus;
  isOverdue: boolean;           // Derived property
  orderIndex: number;
  createdById: string;
  creatorName: string;
  updatedById: string | null;
  updaterName: string | null;
  createdAt: string;            // ISO-8601 string
  updatedAt: string;            // ISO-8601 string
}

export interface ProjectMilestoneSummaryDTO {
  projectId: string;
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  plannedCount: number;
  overdueCount: number;
  nextUpcomingMilestone: {
    id: string;
    title: string;
    targetDate: string;         // "YYYY-MM-DD"
  } | null;
}
