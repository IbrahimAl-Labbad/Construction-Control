/**
 * lib/milestones/evidence-policy.ts
 *
 * Pure domain policy for Project Milestone completion evidence gating (CR-08 / BD-17).
 *
 * Enforces authoritative rules:
 * 1. Pure function: No Prisma or database dependencies.
 * 2. Milestone completion gate requires at least one linked APPROVED progress report
 *    with at least one active (non-voided) qualifying visual attachment.
 * 3. Only visual image MIME types qualify: image/jpeg, image/png, image/webp.
 *    PDF documents (application/pdf) strictly do NOT qualify as visual progress evidence.
 * 4. Only categories PROGRESS_PHOTO and EXECUTION_EVIDENCE qualify.
 * 5. Attachments on DRAFT, SUBMITTED, REJECTED, or CANCELLED reports do NOT qualify.
 * 6. Soft-deleted reports (deletedAt !== null) or voided attachments (voidedAt !== null) do NOT qualify.
 * 7. Evidence is evaluated strictly per report-attachment parent relationship,
 *    preventing cross-report attribution.
 * 8. Returns exact verified report IDs and qualifying attachment IDs for append-only audit logging.
 */

export const QUALIFIED_VISUAL_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type QualifiedVisualMimeType = (typeof QUALIFIED_VISUAL_MIME_TYPES)[number];

export const QUALIFIED_EVIDENCE_CATEGORIES = ['PROGRESS_PHOTO', 'EXECUTION_EVIDENCE'] as const;

export type QualifiedEvidenceCategory = (typeof QUALIFIED_EVIDENCE_CATEGORIES)[number];

export interface EvidenceAttachmentInput {
  id: string;
  category: string;
  mimeType: string;
  voidedAt?: Date | string | null;
}

export interface LinkedReportEvidenceInput {
  id: string;
  status: string;
  deletedAt?: Date | string | null;
  attachments?: EvidenceAttachmentInput[];
}

export interface MilestoneEvidenceEvaluationResult {
  sufficient: boolean;
  verifiedReportIds: string[]; // Strictly approved, non-deleted reports that ACTUALLY contain >= 1 qualified visual attachment
  verifiedAttachmentIds: string[]; // The exact qualifying visual attachment IDs
  verifiedAttachmentCount: number;
}

/**
 * Checks whether an individual attachment satisfies all visual evidence qualification rules.
 */
export function isQualifiedVisualAttachment(attachment: EvidenceAttachmentInput): boolean {
  if (!attachment || typeof attachment !== 'object') {
    return false;
  }

  // Must not be voided
  if (attachment.voidedAt !== null && attachment.voidedAt !== undefined) {
    return false;
  }

  // Must belong to approved evidence categories
  if (!QUALIFIED_EVIDENCE_CATEGORIES.includes(attachment.category as QualifiedEvidenceCategory)) {
    return false;
  }

  // Must have a qualified visual MIME type
  if (!QUALIFIED_VISUAL_MIME_TYPES.includes(attachment.mimeType as QualifiedVisualMimeType)) {
    return false;
  }

  return true;
}

/**
 * Pure evaluation function assessing whether linked progress reports and their attachments
 * satisfy the mandatory visual evidence gate for milestone completion.
 */
export function evaluateMilestoneVisualEvidence(
  linkedReports: LinkedReportEvidenceInput[] | null | undefined,
): MilestoneEvidenceEvaluationResult {
  if (!Array.isArray(linkedReports) || linkedReports.length === 0) {
    return {
      sufficient: false,
      verifiedReportIds: [],
      verifiedAttachmentIds: [],
      verifiedAttachmentCount: 0,
    };
  }

  const verifiedReportIdSet = new Set<string>();
  const verifiedAttachmentIdSet = new Set<string>();

  for (const report of linkedReports) {
    // 1. Report must be in APPROVED status
    if (report.status !== 'APPROVED') {
      continue;
    }

    // 2. Report must NOT be soft-deleted
    if (report.deletedAt !== null && report.deletedAt !== undefined) {
      continue;
    }

    const attachments = report.attachments ?? [];
    let reportHasQualifyingAttachment = false;

    // 3. Evaluate attachments belonging to this specific approved report
    for (const attachment of attachments) {
      if (isQualifiedVisualAttachment(attachment)) {
        verifiedAttachmentIdSet.add(attachment.id);
        reportHasQualifyingAttachment = true;
      }
    }

    // Only include this report in verifiedReportIds if it actually contributed >= 1 qualified attachment
    if (reportHasQualifyingAttachment) {
      verifiedReportIdSet.add(report.id);
    }
  }

  const verifiedReportIds = Array.from(verifiedReportIdSet);
  const verifiedAttachmentIds = Array.from(verifiedAttachmentIdSet);
  const sufficient = verifiedReportIds.length >= 1 && verifiedAttachmentIds.length >= 1;

  return {
    sufficient,
    verifiedReportIds,
    verifiedAttachmentIds,
    verifiedAttachmentCount: verifiedAttachmentIds.length,
  };
}
