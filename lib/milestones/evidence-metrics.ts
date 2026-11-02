/**
 * lib/milestones/evidence-metrics.ts
 *
 * Query helper to calculate live visual progress evidence metrics for Project Milestones (CR-08 / BD-17).
 *
 * Computes:
 * - linkedReportsCount: Total linked reports (non-deleted).
 * - approvedReportsCount: Linked reports with status === APPROVED and deletedAt === null.
 * - visualAttachmentsCount: Non-voided visual attachments (image/jpeg, image/png, image/webp)
 *   with category PROGRESS_PHOTO or EXECUTION_EVIDENCE attached to linked APPROVED reports.
 * - hasSufficientEvidence: approvedReportsCount >= 1 && visualAttachmentsCount >= 1.
 *
 * Optimized to run in 2 fast batch queries, avoiding N+1 performance pitfalls.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type { MilestoneEvidenceMetrics } from './mappers';
import { QUALIFIED_EVIDENCE_CATEGORIES, QUALIFIED_VISUAL_MIME_TYPES } from './evidence-policy';

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function fetchMilestoneEvidenceMetricsMap(
  db: DbClient,
  projectId: string,
  milestoneIds: string[],
): Promise<Map<string, MilestoneEvidenceMetrics>> {
  const result = new Map<string, MilestoneEvidenceMetrics>();

  if (milestoneIds.length === 0) {
    return result;
  }

  // 1. Fetch all linkages for these milestones along with report status and soft-delete state
  const linkages = await db.progressReportMilestone.findMany({
    where: {
      projectId,
      milestoneId: { in: milestoneIds },
    },
    select: {
      milestoneId: true,
      reportId: true,
      report: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  // 2. Identify all approved, non-deleted report IDs across these linkages
  const approvedReportIdSet = new Set<string>();
  for (const linkage of linkages) {
    if (linkage.report.status === 'APPROVED' && linkage.report.deletedAt === null) {
      approvedReportIdSet.add(linkage.reportId);
    }
  }
  const approvedReportIds = Array.from(approvedReportIdSet);

  // 3. Batch query qualifying visual attachments for these approved reports
  const attachments =
    approvedReportIds.length > 0
      ? await db.attachment.findMany({
          where: {
            ownerType: 'PROGRESS_REPORT',
            ownerId: { in: approvedReportIds },
            projectId,
            voidedAt: null,
            category: { in: [...QUALIFIED_EVIDENCE_CATEGORIES] },
            mimeType: { in: [...QUALIFIED_VISUAL_MIME_TYPES] },
          },
          select: {
            id: true,
            ownerId: true,
          },
        })
      : [];

  // Group visual attachment counts by reportId (ownerId)
  const attachmentCountByReportId = new Map<string, number>();
  for (const att of attachments) {
    const current = attachmentCountByReportId.get(att.ownerId) ?? 0;
    attachmentCountByReportId.set(att.ownerId, current + 1);
  }

  // 4. Compute metrics for each requested milestone ID
  for (const mId of milestoneIds) {
    const milestoneLinkages = linkages.filter((l) => l.milestoneId === mId);
    const activeLinkages = milestoneLinkages.filter((l) => l.report.deletedAt === null);
    const linkedReportsCount = activeLinkages.length;

    const approvedLinkages = activeLinkages.filter((l) => l.report.status === 'APPROVED');
    const approvedReportsCount = approvedLinkages.length;

    const pendingLinkages = activeLinkages.filter(
      (l) => l.report.status === 'SUBMITTED' || l.report.status === 'DRAFT',
    );
    const pendingReportsCount = pendingLinkages.length;

    const rejectedLinkages = activeLinkages.filter(
      (l) => l.report.status === 'REJECTED' || l.report.status === 'CANCELLED',
    );
    const rejectedReportsCount = rejectedLinkages.length;

    let visualAttachmentsCount = 0;
    for (const appLink of approvedLinkages) {
      visualAttachmentsCount += attachmentCountByReportId.get(appLink.reportId) ?? 0;
    }

    const hasSufficientEvidence = approvedReportsCount >= 1 && visualAttachmentsCount >= 1;

    result.set(mId, {
      linkedReportsCount,
      approvedReportsCount,
      visualAttachmentsCount,
      hasSufficientEvidence,
      pendingReportsCount,
      rejectedReportsCount,
    });
  }

  return result;
}

export async function fetchSingleMilestoneEvidenceMetrics(
  db: DbClient,
  projectId: string,
  milestoneId: string,
): Promise<MilestoneEvidenceMetrics> {
  const map = await fetchMilestoneEvidenceMetricsMap(db, projectId, [milestoneId]);
  return (
    map.get(milestoneId) ?? {
      linkedReportsCount: 0,
      approvedReportsCount: 0,
      visualAttachmentsCount: 0,
      hasSufficientEvidence: false,
      pendingReportsCount: 0,
      rejectedReportsCount: 0,
    }
  );
}
