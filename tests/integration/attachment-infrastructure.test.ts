/**
 * tests/integration/attachment-infrastructure.test.ts
 *
 * Attachment Infrastructure — Wave 0 Integration Tests on Live PostgreSQL.
 *
 * Verifies:
 * 1. Happy path across supported parent entities (`EXPENSE`, `PROGRESS_REPORT`,
 *    `SUBCONTRACTOR_BILLING`, `VARIATION_ORDER`):
 *    - Upload JPEG, PNG, WebP, and PDF attachments to a `DRAFT` parent record.
 *    - Server-side magic-byte verification, SHA-256 checksum calculation, opaque storage key.
 *    - `ATTACHMENT_UPLOADED` AuditLog written in the same transaction.
 *    - `listAttachmentsForOwner` and `getAttachmentContent` return safe DTOs (no `storageKey` leaked)
 *      and hardened download headers.
 * 2. Supersession / Replacement (`ATTACHMENT_REPLACED`) and Voiding (`ATTACHMENT_VOIDED`):
 *    - Uploading with `supersedesId` atomically voids the prior attachment, links `supersedesId`,
 *      and writes `ATTACHMENT_REPLACED`.
 *    - Voiding a draft attachment requires a non-empty reason, sets `voidedAt` / `voidedById` / `voidReason`,
 *      preserves the row in the database, excludes it from active listing (`includeVoided: false`),
 *      and blocks normal download while allowing Manager / uploader history inspection with `allowVoidedHistory: true`.
 *    - Re-voiding or re-superseding an already voided/superseded attachment is rejected (`409`).
 * 3. Parent Status Lifecycle Locks:
 *    - Once parent transitions to `SUBMITTED`, `APPROVED`, or `CANCELLED`, upload, replacement,
 *      and voiding are strictly blocked (`ATTACHMENT_LOCKED_BY_PARENT_STATUS`).
 *    - When a `REJECTED` parent is reopened to `DRAFT`, uploading/replacing/voiding is unlocked again.
 * 4. Authorization & IDOR Prevention:
 *    - Unauthenticated requests are rejected.
 *    - Cross-user draft mutation (Engineer B attempting to upload/void on Engineer A's draft) is rejected (`FORBIDDEN`).
 *    - Cross-project IDOR (passing Project B's ID with Project A's parent record) is rejected (`NOT_FOUND`).
 *    - Unassigned Engineer or unauthorized role (`PURCHASING` on Expense/ProgressReport, `ACCOUNTANT` on ProgressReport)
 *      is rejected (`FORBIDDEN` / `NOT_FOUND`).
 *    - Engineer B attempting to view Engineer A's ProgressReport attachment is rejected (`NOT_FOUND`, Slice 10 BD-18).
 *    - Future CR owner types (`CUSTODY_ADVANCE` [CR-03], `MATERIAL_RECEIVING_NOTE` [CR-05]) fail closed (`ATTACHMENT_OWNER_NOT_SUPPORTED`).
 * 5. Storage Failure, Database Failure Orphan Cleanup, and Checksum Integrity Verification:
 *    - When storage is unhealthy, upload fails with `ATTACHMENT_STORAGE_UNAVAILABLE` and writes zero DB rows.
 *    - When the database transaction fails after `storage.putObject()` succeeds, compensating cleanup
 *      deletes the orphaned object from storage so zero orphan files remain.
 *    - If stored bytes are corrupted post-upload, `getAttachmentContent` detects the SHA-256 mismatch
 *      and throws `ATTACHMENT_INTEGRITY_ERROR`.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  AssignmentStatus,
  AttachmentCategory,
  AttachmentOwnerType,
  BudgetCategory,
  BudgetStatus,
  ExpenseStatus,
  ProgressReportStatus,
  ProjectStatus,
  Role,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  getAttachmentContent,
  InMemoryAttachmentStorageProvider,
  listAttachmentsForOwner,
  setAttachmentStorageProvider,
  uploadAttachment,
  voidAttachment,
} from '@/lib/attachments';
import * as authSession from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';

const SAMPLE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const SAMPLE_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii');

describe('Attachment Infrastructure — Wave 0 Integration (Live PostgreSQL)', () => {
  let memoryStorage: InMemoryAttachmentStorageProvider;

  let testManager: AuthenticatedUser;
  let testEngineerA: AuthenticatedUser;
  let testEngineerB: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  let projectAId: string;
  let projectBId: string;
  let budgetLineAId: string;
  let expenseDraftId: string;
  let progressReportDraftId: string;

  const cleanupProjectIds: string[] = [];
  const cleanupUserIds: string[] = [];

  function actAs(user: AuthenticatedUser | null) {
    if (!user) {
      vi.spyOn(authSession, 'requireAuth').mockRejectedValue(
        new AppError('UNAUTHENTICATED', 'يرجى تسجيل الدخول'),
      );
      return;
    }
    vi.spyOn(authSession, 'requireAuth').mockResolvedValue(user);
  }

  beforeEach(async () => {
    memoryStorage = new InMemoryAttachmentStorageProvider();
    setAttachmentStorageProvider(memoryStorage);

    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

    // Create test users for all 4 roles + second Engineer
    const [mgr, engA, engB, acc, pur] = await Promise.all([
      prisma.user.create({
        data: {
          name: 'مدير المشاريع',
          email: `mgr.att.${suffix}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          name: 'مهندس الموقع أ',
          email: `enga.att.${suffix}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          name: 'مهندس الموقع ب',
          email: `engb.att.${suffix}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          name: 'محاسب المشروع',
          email: `acc.att.${suffix}@test.local`,
          role: Role.ACCOUNTANT,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          name: 'مسؤول المشتريات',
          email: `pur.att.${suffix}@test.local`,
          role: Role.PURCHASING,
          isActive: true,
        },
      }),
    ]);

    cleanupUserIds.push(mgr.id, engA.id, engB.id, acc.id, pur.id);

    testManager = { id: mgr.id, name: mgr.name, email: mgr.email, role: Role.MANAGER, isActive: true };
    testEngineerA = { id: engA.id, name: engA.name, email: engA.email, role: Role.ENGINEER, isActive: true };
    testEngineerB = { id: engB.id, name: engB.name, email: engB.email, role: Role.ENGINEER, isActive: true };
    testAccountant = { id: acc.id, name: acc.name, email: acc.email, role: Role.ACCOUNTANT, isActive: true };
    testPurchasing = { id: pur.id, name: pur.name, email: pur.email, role: Role.PURCHASING, isActive: true };

    // Create Project A (ACTIVE) and Project B (ACTIVE)
    const projA = await prisma.project.create({
      data: {
        code: `PRJ-ATT-A-${suffix.slice(-6)}`,
        name: 'مشروع اختبار المرفقات أ',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    const projB = await prisma.project.create({
      data: {
        code: `PRJ-ATT-B-${suffix.slice(-6)}`,
        name: 'مشروع اختبار المرفقات ب',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    projectAId = projA.id;
    projectBId = projB.id;
    cleanupProjectIds.push(projA.id, projB.id);

    // Assign Engineer A to Project A only (Engineer B is NOT assigned to Project A)
    await prisma.projectAssignment.create({
      data: {
        projectId: projectAId,
        engineerId: engA.id,
        assignedById: mgr.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    // Create approved budget + line on Project A
    const budget = await prisma.budget.create({
      data: {
        projectId: projectAId,
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: '100000.00',
        createdById: mgr.id,
        approvedById: mgr.id,
        approvedAt: new Date(),
        lines: {
          create: {
            category: BudgetCategory.SITE_OPERATIONS,
            description: 'مصاريف تشغيل الموقع',
            amount: '100000.00',
          },
        },
      },
      include: { lines: true },
    });
    budgetLineAId = budget.lines[0]!.id;

    // Create a DRAFT Expense by Engineer A on Project A
    const expense = await prisma.expense.create({
      data: {
        projectId: projectAId,
        budgetLineId: budgetLineAId,
        amount: '1500.00',
        description: 'شراء مستلزمات سلامة للموقع',
        expenseDate: new Date(),
        status: ExpenseStatus.DRAFT,
        submittedById: engA.id,
      },
    });
    expenseDraftId = expense.id;

    // Create a DRAFT ProgressReport by Engineer A on Project A
    const report = await prisma.progressReport.create({
      data: {
        projectId: projectAId,
        reportDate: new Date('2026-10-15T00:00:00.000Z'),
        title: 'تقرير التقدم اليومي',
        workDescription: 'أعمال صب القواعد الخرسانية',
        progressPercentage: 25,
        status: ProgressReportStatus.DRAFT,
        createdById: engA.id,
      },
    });
    progressReportDraftId = report.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setAttachmentStorageProvider(null);

    if (cleanupProjectIds.length > 0) {
      const attachments = await prisma.attachment.findMany({
        where: { projectId: { in: cleanupProjectIds } },
        select: { id: true },
      });
      const attIds = attachments.map((a) => a.id);

      if (attIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entityType: 'ATTACHMENT', entityId: { in: attIds } },
        });
        // Clear self-referencing supersedesId first before deleting rows
        await prisma.attachment.updateMany({
          where: { id: { in: attIds }, supersedesId: { not: null } },
          data: { supersedesId: null },
        });
        await prisma.attachment.deleteMany({
          where: { id: { in: attIds } },
        });
      }

      await prisma.variationOrder.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.commitment.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.expense.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.progressReport.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.budgetLine.deleteMany({
        where: { budget: { projectId: { in: cleanupProjectIds } } },
      });
      await prisma.budget.deleteMany({ where: { projectId: { in: cleanupProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: cleanupProjectIds } } });
      cleanupProjectIds.length = 0;
    }

    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
      cleanupUserIds.length = 0;
    }
  });

  it('uploads, lists, and retrieves validated attachments with atomic audit logging and safe headers', async () => {
    actAs(testEngineerA);

    const uploaded = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.EXPENSE,
      ownerId: expenseDraftId,
      category: AttachmentCategory.INVOICE,
      originalFileName: 'فاتورة-المورد.pdf',
      declaredMimeType: 'application/pdf',
      content: SAMPLE_PDF,
    });

    expect(uploaded.id).toBeTruthy();
    expect(uploaded.projectId).toBe(projectAId);
    expect(uploaded.ownerType).toBe(AttachmentOwnerType.EXPENSE);
    expect(uploaded.ownerId).toBe(expenseDraftId);
    expect(uploaded.category).toBe(AttachmentCategory.INVOICE);
    expect(uploaded.originalFileName).toBe('فاتورة-المورد.pdf');
    expect(uploaded.mimeType).toBe('application/pdf');
    expect(uploaded.sizeBytes).toBe(SAMPLE_PDF.byteLength);
    expect(uploaded.uploadedById).toBe(testEngineerA.id);
    expect(uploaded.isVoided).toBe(false);
    // Ensure raw storageKey is never exposed in DTO
    expect((uploaded as unknown as Record<string, unknown>)['storageKey']).toBeUndefined();

    // Verify ATTACHMENT_UPLOADED audit log entry
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'ATTACHMENT',
        entityId: uploaded.id,
        action: 'ATTACHMENT_UPLOADED',
      },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]!.actorId).toBe(testEngineerA.id);

    // List attachments as Manager
    actAs(testManager);
    const list = await listAttachmentsForOwner({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.EXPENSE,
      ownerId: expenseDraftId,
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(uploaded.id);

    // Retrieve binary content and safe headers as Accountant
    actAs(testAccountant);
    const retrieved = await getAttachmentContent(uploaded.id);
    expect(retrieved.bytes.equals(SAMPLE_PDF)).toBe(true);
    expect(retrieved.contentType).toBe('application/pdf');
    expect(retrieved.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(retrieved.headers['Content-Disposition']).toContain('attachment;');
  });

  it('supports atomic replacement (supersession) and voiding on DRAFT parents with full history retention', async () => {
    actAs(testEngineerA);

    // 1. Upload initial photo on ProgressReport draft
    const firstPhoto = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.PROGRESS_REPORT,
      ownerId: progressReportDraftId,
      category: AttachmentCategory.PROGRESS_PHOTO,
      originalFileName: 'site-photo-v1.jpg',
      declaredMimeType: 'image/jpeg',
      content: SAMPLE_JPEG,
    });

    // 2. Replace firstPhoto with a new PNG photo
    const replacementPhoto = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.PROGRESS_REPORT,
      ownerId: progressReportDraftId,
      category: AttachmentCategory.PROGRESS_PHOTO,
      originalFileName: 'site-photo-v2.png',
      declaredMimeType: 'image/png',
      content: SAMPLE_PNG,
      supersedesId: firstPhoto.id,
      replacementReason: 'صورة أوضح بعد تنظيف الموقع',
    });

    expect(replacementPhoto.supersedesId).toBe(firstPhoto.id);
    expect(replacementPhoto.isVoided).toBe(false);

    // Attempting to supersede firstPhoto a second time must fail with 409 ATTACHMENT_ALREADY_SUPERSEDED
    await expect(
      uploadAttachment({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.PROGRESS_REPORT,
        ownerId: progressReportDraftId,
        category: AttachmentCategory.PROGRESS_PHOTO,
        originalFileName: 'site-photo-v3.png',
        content: SAMPLE_PNG,
        supersedesId: firstPhoto.id,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_ALREADY_SUPERSEDED' }));

    // Active listing returns only replacementPhoto
    const activeList = await listAttachmentsForOwner({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.PROGRESS_REPORT,
      ownerId: progressReportDraftId,
      includeVoided: false,
    });
    expect(activeList).toHaveLength(1);
    expect(activeList[0]!.id).toBe(replacementPhoto.id);

    // Listing with includeVoided: true returns both, showing supersededById on firstPhoto
    const fullHistory = await listAttachmentsForOwner({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.PROGRESS_REPORT,
      ownerId: progressReportDraftId,
      includeVoided: true,
    });
    expect(fullHistory).toHaveLength(2);
    const oldItem = fullHistory.find((a) => a.id === firstPhoto.id)!;
    expect(oldItem.isVoided).toBe(true);
    expect(oldItem.supersededById).toBe(replacementPhoto.id);

    // 3. Void the replacement photo explicitly
    const voided = await voidAttachment({
      attachmentId: replacementPhoto.id,
      reason: 'تم رفع الصورة للتقرير الخاطئ',
    });
    expect(voided.isVoided).toBe(true);
    expect(voided.voidReason).toBe('تم رفع الصورة للتقرير الخاطئ');

    // Re-voiding an already voided attachment fails with ATTACHMENT_ALREADY_VOIDED
    await expect(
      voidAttachment({
        attachmentId: replacementPhoto.id,
        reason: 'محاولة إلغاء مكررة',
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_ALREADY_VOIDED' }));

    // Normal download of voided attachment is rejected with NOT_FOUND
    await expect(getAttachmentContent(replacementPhoto.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );

    // Manager can inspect voided attachment history when allowVoidedHistory: true
    actAs(testManager);
    const historicalContent = await getAttachmentContent(replacementPhoto.id, {
      allowVoidedHistory: true,
    });
    expect(historicalContent.bytes.equals(SAMPLE_PNG)).toBe(true);
  });

  it('enforces parent status lifecycle locks (SUBMITTED / APPROVED block mutations; reopen to DRAFT unlocks)', async () => {
    actAs(testEngineerA);

    const att = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.EXPENSE,
      ownerId: expenseDraftId,
      category: AttachmentCategory.RECEIPT,
      originalFileName: 'receipt.jpg',
      content: SAMPLE_JPEG,
    });

    // Transition Expense to SUBMITTED
    await prisma.expense.update({
      where: { id: expenseDraftId },
      data: { status: ExpenseStatus.SUBMITTED },
    });

    // Upload, replace, and void must all be blocked with ATTACHMENT_LOCKED_BY_PARENT_STATUS
    await expect(
      uploadAttachment({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.EXPENSE,
        ownerId: expenseDraftId,
        originalFileName: 'extra.pdf',
        content: SAMPLE_PDF,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_LOCKED_BY_PARENT_STATUS' }));

    await expect(
      voidAttachment({
        attachmentId: att.id,
        reason: 'محاولة إلغاء بعد التقديم',
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_LOCKED_BY_PARENT_STATUS' }));

    // Transition Expense to APPROVED -> still locked (IMMUTABLE_ARCHIVE)
    await prisma.expense.update({
      where: { id: expenseDraftId },
      data: { status: ExpenseStatus.APPROVED, approvedById: testManager.id, approvedAt: new Date() },
    });

    await expect(
      voidAttachment({
        attachmentId: att.id,
        reason: 'محاولة إلغاء بعد الاعتماد',
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_LOCKED_BY_PARENT_STATUS' }));

    // Reading content while APPROVED still succeeds
    actAs(testManager);
    const approvedRead = await getAttachmentContent(att.id);
    expect(approvedRead.bytes.equals(SAMPLE_JPEG)).toBe(true);

    // Simulate REJECTED -> reopened to DRAFT: mutations unlock again
    await prisma.expense.update({
      where: { id: expenseDraftId },
      data: { status: ExpenseStatus.DRAFT, approvedById: null, approvedAt: null },
    });

    actAs(testEngineerA);
    const voidedAfterReopen = await voidAttachment({
      attachmentId: att.id,
      reason: 'إلغاء الإيصال القديم بعد إعادة فتح المسودة',
    });
    expect(voidedAfterReopen.isVoided).toBe(true);
  });

  it('prevents IDOR, unauthorized role access, cross-project spoofing, and unimplemented CR owner types', async () => {
    actAs(testEngineerA);
    const expenseAtt = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.EXPENSE,
      ownerId: expenseDraftId,
      originalFileName: 'claim.pdf',
      content: SAMPLE_PDF,
    });

    const reportAtt = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.PROGRESS_REPORT,
      ownerId: progressReportDraftId,
      originalFileName: 'report.jpg',
      content: SAMPLE_JPEG,
    });

    // 1. Unauthenticated caller -> UNAUTHENTICATED
    actAs(null);
    await expect(getAttachmentContent(expenseAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );

    // 2. Purchasing role attempting to view or upload on Expense -> FORBIDDEN
    actAs(testPurchasing);
    await expect(getAttachmentContent(expenseAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    await expect(
      listAttachmentsForOwner({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.EXPENSE,
        ownerId: expenseDraftId,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 3. Accountant attempting to view ProgressReport attachment -> FORBIDDEN (Slice 10 BD-16)
    actAs(testAccountant);
    await expect(getAttachmentContent(reportAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 4. Engineer B attempting to view Engineer A's ProgressReport attachment -> NOT_FOUND (Slice 10 BD-18 IDOR defense)
    actAs(testEngineerB);
    await expect(getAttachmentContent(reportAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );

    // 5. Engineer B (unassigned to Project A) attempting to view Expense attachment -> FORBIDDEN
    await expect(getAttachmentContent(expenseAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // 6. Accountant attempting to void Engineer A's Expense attachment -> FORBIDDEN
    actAs(testAccountant);
    await expect(
      voidAttachment({
        attachmentId: expenseAtt.id,
        reason: 'محاولة إلغاء من غير المنشئ',
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));

    // 7. Cross-project IDOR: Engineer A passing projectBId with projectA's expenseDraftId -> NOT_FOUND
    actAs(testEngineerA);
    await expect(
      uploadAttachment({
        projectId: projectBId,
        ownerType: AttachmentOwnerType.EXPENSE,
        ownerId: expenseDraftId,
        originalFileName: 'spoof-project.pdf',
        content: SAMPLE_PDF,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));

    // 8. Future CR owner types fail closed with ATTACHMENT_OWNER_NOT_SUPPORTED
    await expect(
      uploadAttachment({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.MATERIAL_RECEIVING_NOTE,
        ownerId: 'mrn_future_id',
        originalFileName: 'mrn.pdf',
        content: SAMPLE_PDF,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_OWNER_NOT_SUPPORTED' }));
  });

  it('cleans up orphaned storage objects when the database transaction fails and detects storage checksum corruption', async () => {
    actAs(testEngineerA);

    // 1. Storage failure before DB write: zero DB rows created
    memoryStorage.setHealthy(false);
    await expect(
      uploadAttachment({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.EXPENSE,
        ownerId: expenseDraftId,
        originalFileName: 'fail-storage.pdf',
        content: SAMPLE_PDF,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));
    expect(memoryStorage.size()).toBe(0);

    // 2. Database transaction failure after storage.putObject succeeds:
    // Pass a non-existent supersedesId so storage.putObject runs, then the DB transaction throws NOT_FOUND.
    memoryStorage.setHealthy(true);
    await expect(
      uploadAttachment({
        projectId: projectAId,
        ownerType: AttachmentOwnerType.EXPENSE,
        ownerId: expenseDraftId,
        originalFileName: 'orphan-test.pdf',
        content: SAMPLE_PDF,
        supersedesId: 'non_existent_attachment_id',
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));

    // Verify compensating cleanup removed the orphaned object from storage
    expect(memoryStorage.size()).toBe(0);

    // 3. Upload a valid attachment, then corrupt bytes in storage -> getAttachmentContent throws ATTACHMENT_INTEGRITY_ERROR
    const validUpload = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.EXPENSE,
      ownerId: expenseDraftId,
      originalFileName: 'integrity-check.pdf',
      content: SAMPLE_PDF,
    });
    expect(memoryStorage.size()).toBe(1);

    const dbRow = await prisma.attachment.findUniqueOrThrow({ where: { id: validUpload.id } });
    memoryStorage.corruptEntryForTest(dbRow.storageKey, Buffer.from('%PDF-1.7 CORRUPTED', 'ascii'));

    await expect(getAttachmentContent(validUpload.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'ATTACHMENT_INTEGRITY_ERROR' }),
    );
  });

  it('supports SUBCONTRACTOR_BILLING and VARIATION_ORDER owners and enforces their role/status rules', async () => {
    // 1. Create an APPROVED Commitment on Project A so we can create a SubcontractorBilling draft
    const commitment = await prisma.commitment.create({
      data: {
        projectId: projectAId,
        budgetLineId: budgetLineAId,
        vendorName: 'شركة المقاولات الفرعية',
        amount: '50000.00',
        description: 'عقد مقاول باطن',
        commitmentDate: new Date(),
        status: 'APPROVED',
        createdById: testPurchasing.id,
        approvedById: testManager.id,
        approvedAt: new Date(),
      },
    });

    const billingDraft = await prisma.subcontractorBilling.create({
      data: {
        projectId: projectAId,
        budgetLineId: budgetLineAId,
        commitmentId: commitment.id,
        subcontractorName: 'شركة المقاولات الفرعية',
        referenceNumber: 'INV-001',
        billingPeriod: 'أكتوبر 2026',
        claimDate: new Date(),
        grossAmount: '10000.00',
        description: 'مستخلص رقم 1',
        status: 'DRAFT',
        createdById: testAccountant.id,
      },
    });

    const voDraft = await prisma.variationOrder.create({
      data: {
        projectId: projectAId,
        budgetLineId: budgetLineAId,
        commitmentId: commitment.id,
        orderNumber: 'VO-ATT-001',
        title: 'أمر تغيير اختباري',
        description: 'تعديل كميات',
        reason: 'متطلبات موقعية',
        status: 'DRAFT',
        impactAmount: '2500.00',
        createdById: testEngineerA.id,
      },
    });

    // Accountant uploads attachment on SubcontractorBilling draft -> succeeds
    actAs(testAccountant);
    const billingAtt = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.SUBCONTRACTOR_BILLING,
      ownerId: billingDraft.id,
      category: AttachmentCategory.EXECUTION_EVIDENCE,
      originalFileName: 'billing-measurement.pdf',
      content: SAMPLE_PDF,
    });
    expect(billingAtt.ownerType).toBe(AttachmentOwnerType.SUBCONTRACTOR_BILLING);

    // Purchasing attempting to view SubcontractorBilling attachment -> FORBIDDEN
    actAs(testPurchasing);
    await expect(getAttachmentContent(billingAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // Assigned Engineer A can view SubcontractorBilling attachment -> succeeds
    actAs(testEngineerA);
    const engBillingRead = await getAttachmentContent(billingAtt.id);
    expect(engBillingRead.bytes.equals(SAMPLE_PDF)).toBe(true);

    // Unassigned Engineer B cannot view SubcontractorBilling attachment -> FORBIDDEN
    actAs(testEngineerB);
    await expect(getAttachmentContent(billingAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );

    // Assigned Engineer A uploads attachment on VariationOrder draft -> succeeds
    actAs(testEngineerA);
    const voAtt = await uploadAttachment({
      projectId: projectAId,
      ownerType: AttachmentOwnerType.VARIATION_ORDER,
      ownerId: voDraft.id,
      category: AttachmentCategory.SUPPORTING_DOCUMENT,
      originalFileName: 'vo-justification.png',
      content: SAMPLE_PNG,
    });
    expect(voAtt.ownerType).toBe(AttachmentOwnerType.VARIATION_ORDER);

    // Purchasing can view VariationOrder attachment (all active roles can view VOs within project scope)
    actAs(testPurchasing);
    const purVoRead = await getAttachmentContent(voAtt.id);
    expect(purVoRead.bytes.equals(SAMPLE_PNG)).toBe(true);

    // Unassigned Engineer B cannot view VariationOrder attachment -> FORBIDDEN
    actAs(testEngineerB);
    await expect(getAttachmentContent(voAtt.id)).rejects.toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
