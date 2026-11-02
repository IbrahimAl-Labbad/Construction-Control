/**
 * tests/unit/lib/milestone-evidence-policy.test.ts
 *
 * Unit tests for pure milestone evidence evaluation policy (CR-08 / BD-17).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateMilestoneVisualEvidence,
  isQualifiedVisualAttachment,
  type LinkedReportEvidenceInput,
} from '@/lib/milestones/evidence-policy';

describe('evaluateMilestoneVisualEvidence', () => {
  it('returns insufficient when linked reports list is null, undefined, or empty', () => {
    expect(evaluateMilestoneVisualEvidence(null)).toEqual({
      sufficient: false,
      verifiedReportIds: [],
      verifiedAttachmentIds: [],
      verifiedAttachmentCount: 0,
    });

    expect(evaluateMilestoneVisualEvidence(undefined)).toEqual({
      sufficient: false,
      verifiedReportIds: [],
      verifiedAttachmentIds: [],
      verifiedAttachmentCount: 0,
    });

    expect(evaluateMilestoneVisualEvidence([])).toEqual({
      sufficient: false,
      verifiedReportIds: [],
      verifiedAttachmentIds: [],
      verifiedAttachmentCount: 0,
    });
  });

  it('rejects reports that are not in APPROVED status (DRAFT, SUBMITTED, REJECTED, CANCELLED)', () => {
    const unapprovedReports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-draft',
        status: 'DRAFT',
        deletedAt: null,
        attachments: [
          {
            id: 'att-1',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
        ],
      },
      {
        id: 'rep-sub',
        status: 'SUBMITTED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-2',
            category: 'EXECUTION_EVIDENCE',
            mimeType: 'image/png',
            voidedAt: null,
          },
        ],
      },
      {
        id: 'rep-rej',
        status: 'REJECTED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-3',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/webp',
            voidedAt: null,
          },
        ],
      },
      {
        id: 'rep-can',
        status: 'CANCELLED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-4',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(unapprovedReports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('rejects an approved report that is soft-deleted (deletedAt !== null)', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-deleted',
        status: 'APPROVED',
        deletedAt: new Date(),
        attachments: [
          {
            id: 'att-photo',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('rejects an approved report with zero attachments', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-empty',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('rejects PDF documents as visual progress evidence', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-pdf',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-pdf',
            category: 'PROGRESS_PHOTO',
            mimeType: 'application/pdf',
            voidedAt: null,
          },
          {
            id: 'att-doc',
            category: 'EXECUTION_EVIDENCE',
            mimeType: 'application/pdf',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('rejects voided visual attachments (voidedAt !== null)', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-voided',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-voided-photo',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: new Date(),
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('rejects attachments outside allowed categories (e.g. RECEIPT, INVOICE, SUPPORTING_DOCUMENT)', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-financial-category',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-receipt',
            category: 'RECEIPT',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
          {
            id: 'att-invoice',
            category: 'INVOICE',
            mimeType: 'image/png',
            voidedAt: null,
          },
          {
            id: 'att-supp',
            category: 'SUPPORTING_DOCUMENT',
            mimeType: 'image/webp',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(false);
    expect(result.verifiedReportIds).toEqual([]);
    expect(result.verifiedAttachmentIds).toEqual([]);
    expect(result.verifiedAttachmentCount).toBe(0);
  });

  it('qualifies an approved report with a valid JPEG, PNG, or WebP photo', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-valid',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-jpeg',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
          {
            id: 'att-png',
            category: 'EXECUTION_EVIDENCE',
            mimeType: 'image/png',
            voidedAt: null,
          },
          {
            id: 'att-webp',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/webp',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(true);
    expect(result.verifiedReportIds).toEqual(['rep-valid']);
    expect(result.verifiedAttachmentIds).toEqual(['att-jpeg', 'att-png', 'att-webp']);
    expect(result.verifiedAttachmentCount).toBe(3);
  });

  it('evaluates multiple reports and returns only the approved reports that actually contribute photos', () => {
    const reports: LinkedReportEvidenceInput[] = [
      {
        id: 'rep-text-only',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [],
      },
      {
        id: 'rep-draft-with-photo',
        status: 'DRAFT',
        deletedAt: null,
        attachments: [
          {
            id: 'att-draft-photo',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
        ],
      },
      {
        id: 'rep-approved-with-photo',
        status: 'APPROVED',
        deletedAt: null,
        attachments: [
          {
            id: 'att-approved-photo',
            category: 'PROGRESS_PHOTO',
            mimeType: 'image/jpeg',
            voidedAt: null,
          },
          {
            id: 'att-approved-pdf',
            category: 'PROGRESS_PHOTO',
            mimeType: 'application/pdf',
            voidedAt: null,
          },
        ],
      },
    ];

    const result = evaluateMilestoneVisualEvidence(reports);
    expect(result.sufficient).toBe(true);
    expect(result.verifiedReportIds).toEqual(['rep-approved-with-photo']);
    expect(result.verifiedAttachmentIds).toEqual(['att-approved-photo']);
    expect(result.verifiedAttachmentCount).toBe(1);
  });
});

describe('isQualifiedVisualAttachment', () => {
  it('returns true for active visual progress attachments', () => {
    expect(
      isQualifiedVisualAttachment({
        id: 'att-1',
        category: 'PROGRESS_PHOTO',
        mimeType: 'image/jpeg',
        voidedAt: null,
      }),
    ).toBe(true);

    expect(
      isQualifiedVisualAttachment({
        id: 'att-2',
        category: 'EXECUTION_EVIDENCE',
        mimeType: 'image/webp',
        voidedAt: null,
      }),
    ).toBe(true);
  });

  it('returns false for non-object, voided, wrong category, or wrong mime', () => {
    expect(
      isQualifiedVisualAttachment(
        null as unknown as Parameters<typeof isQualifiedVisualAttachment>[0],
      ),
    ).toBe(false);
    expect(
      isQualifiedVisualAttachment({
        id: 'att-void',
        category: 'PROGRESS_PHOTO',
        mimeType: 'image/jpeg',
        voidedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      isQualifiedVisualAttachment({
        id: 'att-doc',
        category: 'SUPPORTING_DOCUMENT',
        mimeType: 'image/jpeg',
        voidedAt: null,
      }),
    ).toBe(false);
    expect(
      isQualifiedVisualAttachment({
        id: 'att-pdf',
        category: 'PROGRESS_PHOTO',
        mimeType: 'application/pdf',
        voidedAt: null,
      }),
    ).toBe(false);
  });
});
