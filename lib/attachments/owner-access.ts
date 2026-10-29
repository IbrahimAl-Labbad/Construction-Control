/**
 * lib/attachments/owner-access.ts
 *
 * Polymorphic parent-entity resolution, row-locking, object-level authorization,
 * and derived attachment lifecycle rules for Attachment Infrastructure — Wave 0.
 *
 * ARCHITECTURAL & SECURITY INVARIANTS (AGENTS.md §12, §18; Addendum §8, §9):
 * 1. `Attachment` has a polymorphic `(ownerType, ownerId)` reference without
 *    PostgreSQL foreign-key enforcement. Every upload, replacement, void, list,
 *    and content retrieval MUST resolve the parent entity through this module.
 * 2. Object-level & project-level authorization:
 *    - Verifies `parent.projectId === projectId` and `parent.deletedAt === null`.
 *    - Enforces role-level and ownership/assignment rules matching the parent module.
 *    - Prevents IDOR across projects, users, and parent records.
 * 3. Lifecycle state is derived from the parent record's status (Addendum §9):
 *    - `DRAFT`: Uploader (record author) may upload, replace, and void.
 *    - `SUBMITTED` / `AUDITED`: LOCKED. No void, no replacement, no draft upload.
 *    - `REJECTED`:
 *      - Existing domain state machines require reopening `REJECTED -> DRAFT` before edits.
 *      - Only once in `DRAFT` (or if a module explicitly permits rejected-state edits) are mutations allowed.
 *    - `APPROVED`: IMMUTABLE ARCHIVE. Never voided, replaced, or mutated.
 *    - `CANCELLED` / `REVERSED`: READ_ONLY_TERMINAL. Retained as read-only history.
 * 4. Unimplemented CR owner types (`CUSTODY_ADVANCE` [CR-03], `MATERIAL_RECEIVING_NOTE` [CR-05])
 *    fail closed with `ATTACHMENT_OWNER_NOT_SUPPORTED` until their respective
 *    implementation slices are authorized and integrated.
 */

import {
  AssignmentStatus,
  AttachmentOwnerType,
  ExpenseStatus,
  ProgressReportStatus,
  ProjectStatus,
  Role,
  SubcontractorBillingStatus,
  VariationOrderStatus,
  type Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AppError } from '@/lib/errors';
import type { DerivedAttachmentLifecycleState } from './types';

export type PrismaTransactionOrClient = Prisma.TransactionClient;

export type ResolvedAttachmentOwner = {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  projectId: string;
  projectStatus: ProjectStatus;
  parentStatus: string;
  authorUserId: string;
  lifecycleState: DerivedAttachmentLifecycleState;
};

/**
 * Derives the attachment lifecycle state from the parent record's status.
 */
export function deriveAttachmentLifecycleState(
  parentStatus: string,
): DerivedAttachmentLifecycleState {
  switch (parentStatus) {
    case 'DRAFT':
      return 'EDITABLE_DRAFT';
    case 'SUBMITTED':
    case 'AUDITED':
      return 'LOCKED_IN_REVIEW';
    case 'REJECTED':
      return 'UNLOCKED_REJECTED';
    case 'APPROVED':
      return 'IMMUTABLE_ARCHIVE';
    case 'CANCELLED':
    case 'REVERSED':
    default:
      return 'READ_ONLY_TERMINAL';
  }
}

async function hasActiveEngineerAssignment(
  tx: PrismaTransactionOrClient,
  projectId: string,
  engineerId: string,
): Promise<boolean> {
  const assignment = await tx.projectAssignment.findFirst({
    where: {
      projectId,
      engineerId,
      status: AssignmentStatus.ACTIVE,
    },
    select: { id: true },
  });
  return Boolean(assignment);
}

/**
 * Resolves the parent record for `(projectId, ownerType, ownerId)`.
 * When `lockParentRow === true`, acquires a `SELECT ... FOR UPDATE` row lock
 * on the parent table (Level 6 operational header lock) to serialize attachment
 * mutations against concurrent `submit`/`approve`/`delete` transitions.
 */
export async function resolveAndAuthorizeOwnerAccess(params: {
  tx: PrismaTransactionOrClient;
  actor: AuthenticatedUser;
  projectId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  intent: 'VIEW' | 'MUTATE_DRAFT';
  lockParentRow: boolean;
}): Promise<ResolvedAttachmentOwner> {
  const { tx, actor, projectId, ownerType, ownerId, intent, lockParentRow } = params;

  if (!actor.isActive) {
    throw new AppError('ACCOUNT_INACTIVE', 'الحساب غير نشط');
  }

  switch (ownerType) {
    case AttachmentOwnerType.EXPENSE:
      return resolveExpenseOwner({ tx, actor, projectId, ownerId, intent, lockParentRow });

    case AttachmentOwnerType.PROGRESS_REPORT:
      return resolveProgressReportOwner({ tx, actor, projectId, ownerId, intent, lockParentRow });

    case AttachmentOwnerType.SUBCONTRACTOR_BILLING:
      return resolveSubcontractorBillingOwner({
        tx,
        actor,
        projectId,
        ownerId,
        intent,
        lockParentRow,
      });

    case AttachmentOwnerType.VARIATION_ORDER:
      return resolveVariationOrderOwner({ tx, actor, projectId, ownerId, intent, lockParentRow });

    case AttachmentOwnerType.CUSTODY_ADVANCE:
    case AttachmentOwnerType.MATERIAL_RECEIVING_NOTE:
      throw new AppError(
        'ATTACHMENT_OWNER_NOT_SUPPORTED',
        `نوع السجل (${ownerType}) غير مفعل في هذه الشريحة التأسيسية ويتطلب تفعيل شريحة الأعمال الخاصة به أولاً`,
      );

    default:
      throw new AppError('ATTACHMENT_OWNER_NOT_SUPPORTED', 'نوع السجل غير مدعوم');
  }
}

// ---------------------------------------------------------------------------
// 1. EXPENSE Owner Resolution (Slice 4)
// ---------------------------------------------------------------------------

async function resolveExpenseOwner(params: {
  tx: PrismaTransactionOrClient;
  actor: AuthenticatedUser;
  projectId: string;
  ownerId: string;
  intent: 'VIEW' | 'MUTATE_DRAFT';
  lockParentRow: boolean;
}): Promise<ResolvedAttachmentOwner> {
  const { tx, actor, projectId, ownerId, intent, lockParentRow } = params;

  // Purchasing never has access to Expenses (AGENTS.md §5.4, policies.canViewExpenses)
  if (actor.role === Role.PURCHASING) {
    throw new AppError('FORBIDDEN', 'غير مصرح لمسؤول المشتريات بالوصول إلى مرفقات المصروفات');
  }

  if (lockParentRow && typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${ownerId} FOR UPDATE`;
  }

  const expense = await tx.expense.findFirst({
    where: {
      id: ownerId,
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      submittedById: true,
      project: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!expense || expense.project.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'سجل المصروف غير موجود أو لا ينتمي لهذا المشروع');
  }

  if (intent === 'VIEW') {
    if (actor.role === Role.ENGINEER && expense.submittedById !== actor.id) {
      const assigned = await hasActiveEngineerAssignment(tx, projectId, actor.id);
      if (!assigned) {
        throw new AppError('FORBIDDEN', 'غير مصرح لك باستعراض مرفقات هذا المشروع');
      }
    }
  } else {
    // MUTATE_DRAFT: Only the creator (ENGINEER or ACCOUNTANT) while in DRAFT on an ACTIVE project
    if (actor.role !== Role.ENGINEER && actor.role !== Role.ACCOUNTANT) {
      throw new AppError('FORBIDDEN', 'غير مصرح لدورك بإدارة مرفقات مسودة المصروف');
    }
    if (expense.submittedById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تعديل مرفقات مصروف أنشأه مستخدم آخر');
    }
    if (actor.role === Role.ENGINEER) {
      const assigned = await hasActiveEngineerAssignment(tx, projectId, actor.id);
      if (!assigned) {
        throw new AppError('FORBIDDEN', 'يجب أن يكون المهندس معيناً على المشروع لإدارة مرفقاته');
      }
    }
    if (expense.project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن تعديل مرفقات لمشروع غير نشط');
    }
    if (expense.status !== ExpenseStatus.DRAFT) {
      throw new AppError(
        'ATTACHMENT_LOCKED_BY_PARENT_STATUS',
        `لا يمكن إضافة أو استبدال أو إلغاء المرفقات لأن حالة المصروف الحالية (${expense.status}) مقفلة`,
      );
    }
  }

  return {
    ownerType: AttachmentOwnerType.EXPENSE,
    ownerId: expense.id,
    projectId: expense.projectId,
    projectStatus: expense.project.status,
    parentStatus: expense.status,
    authorUserId: expense.submittedById,
    lifecycleState: deriveAttachmentLifecycleState(expense.status),
  };
}

// ---------------------------------------------------------------------------
// 2. PROGRESS_REPORT Owner Resolution (Slice 10)
// ---------------------------------------------------------------------------

async function resolveProgressReportOwner(params: {
  tx: PrismaTransactionOrClient;
  actor: AuthenticatedUser;
  projectId: string;
  ownerId: string;
  intent: 'VIEW' | 'MUTATE_DRAFT';
  lockParentRow: boolean;
}): Promise<ResolvedAttachmentOwner> {
  const { tx, actor, projectId, ownerId, intent, lockParentRow } = params;

  // Progress Reports are accessible only to MANAGER and ENGINEER (Slice 10 BD-16)
  if (actor.role !== Role.MANAGER && actor.role !== Role.ENGINEER) {
    throw new AppError('FORBIDDEN', 'غير مصرح لدورك بالوصول إلى مرفقات تقارير التقدم');
  }

  if (lockParentRow && typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT id FROM progress_reports WHERE id = ${ownerId} FOR UPDATE`;
  }

  const report = await tx.progressReport.findFirst({
    where: {
      id: ownerId,
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdById: true,
      project: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!report || report.project.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود أو لا ينتمي لهذا المشروع');
  }

  // Slice 10 BD-18 IDOR rule: Engineer can only view/manage their own progress reports
  if (actor.role === Role.ENGINEER && report.createdById !== actor.id) {
    throw new AppError('NOT_FOUND', 'تقرير التقدم غير موجود');
  }

  if (intent === 'MUTATE_DRAFT') {
    if (actor.role !== Role.ENGINEER || report.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'فقط المهندس منشئ التقرير يمكنه تعديل مرفقات المسودة');
    }
    if (report.project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن تعديل مرفقات تقرير في مشروع غير نشط');
    }
    if (report.status !== ProgressReportStatus.DRAFT) {
      throw new AppError(
        'ATTACHMENT_LOCKED_BY_PARENT_STATUS',
        `لا يمكن إضافة أو استبدال أو إلغاء المرفقات لأن حالة التقرير الحالية (${report.status}) مقفلة`,
      );
    }
  }

  return {
    ownerType: AttachmentOwnerType.PROGRESS_REPORT,
    ownerId: report.id,
    projectId: report.projectId,
    projectStatus: report.project.status,
    parentStatus: report.status,
    authorUserId: report.createdById,
    lifecycleState: deriveAttachmentLifecycleState(report.status),
  };
}

// ---------------------------------------------------------------------------
// 3. SUBCONTRACTOR_BILLING Owner Resolution (Slice 7)
// ---------------------------------------------------------------------------

async function resolveSubcontractorBillingOwner(params: {
  tx: PrismaTransactionOrClient;
  actor: AuthenticatedUser;
  projectId: string;
  ownerId: string;
  intent: 'VIEW' | 'MUTATE_DRAFT';
  lockParentRow: boolean;
}): Promise<ResolvedAttachmentOwner> {
  const { tx, actor, projectId, ownerId, intent, lockParentRow } = params;

  // Purchasing has no access to subcontractor billings (Slice 7, policies.canViewBillings)
  if (actor.role === Role.PURCHASING) {
    throw new AppError('FORBIDDEN', 'غير مصرح لمسؤول المشتريات بالوصول إلى مرفقات المستخلصات');
  }

  if (lockParentRow && typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT id FROM subcontractor_billings WHERE id = ${ownerId} FOR UPDATE`;
  }

  const billing = await tx.subcontractorBilling.findFirst({
    where: {
      id: ownerId,
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdById: true,
      project: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!billing || billing.project.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'المستخلص غير موجود أو لا ينتمي لهذا المشروع');
  }

  if (intent === 'VIEW') {
    if (actor.role === Role.ENGINEER) {
      const assigned = await hasActiveEngineerAssignment(tx, projectId, actor.id);
      if (!assigned) {
        throw new AppError('FORBIDDEN', 'غير مصرح لك باستعراض مرفقات مستخلصات هذا المشروع');
      }
    }
  } else {
    // MUTATE_DRAFT: In current Slice 7 schema, Accountant creates & manages billing drafts
    if (actor.role !== Role.ACCOUNTANT || billing.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'فقط منشئ مسودة المستخلص يمكنه تعديل مرفقاتها');
    }
    if (billing.project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن تعديل مرفقات مستخلص في مشروع غير نشط');
    }
    if (billing.status !== SubcontractorBillingStatus.DRAFT) {
      throw new AppError(
        'ATTACHMENT_LOCKED_BY_PARENT_STATUS',
        `لا يمكن إضافة أو استبدال أو إلغاء المرفقات لأن حالة المستخلص الحالية (${billing.status}) مقفلة`,
      );
    }
  }

  return {
    ownerType: AttachmentOwnerType.SUBCONTRACTOR_BILLING,
    ownerId: billing.id,
    projectId: billing.projectId,
    projectStatus: billing.project.status,
    parentStatus: billing.status,
    authorUserId: billing.createdById,
    lifecycleState: deriveAttachmentLifecycleState(billing.status),
  };
}

// ---------------------------------------------------------------------------
// 4. VARIATION_ORDER Owner Resolution (Slice 20)
// ---------------------------------------------------------------------------

async function resolveVariationOrderOwner(params: {
  tx: PrismaTransactionOrClient;
  actor: AuthenticatedUser;
  projectId: string;
  ownerId: string;
  intent: 'VIEW' | 'MUTATE_DRAFT';
  lockParentRow: boolean;
}): Promise<ResolvedAttachmentOwner> {
  const { tx, actor, projectId, ownerId, intent, lockParentRow } = params;

  if (lockParentRow && typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT id FROM variation_orders WHERE id = ${ownerId} FOR UPDATE`;
  }

  const vo = await tx.variationOrder.findFirst({
    where: {
      id: ownerId,
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdById: true,
      project: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!vo || vo.project.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'أمر التغيير غير موجود أو لا ينتمي لهذا المشروع');
  }

  if (intent === 'VIEW') {
    if (actor.role === Role.ENGINEER && vo.createdById !== actor.id) {
      const assigned = await hasActiveEngineerAssignment(tx, projectId, actor.id);
      if (!assigned) {
        throw new AppError('FORBIDDEN', 'غير مصرح لك باستعراض مرفقات أوامر التغيير لهذا المشروع');
      }
    }
  } else {
    // MUTATE_DRAFT: Only creator Engineer while in DRAFT on an ACTIVE project
    if (actor.role !== Role.ENGINEER || vo.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'فقط المهندس منشئ مسودة أمر التغيير يمكنه تعديل مرفقاتها');
    }
    const assigned = await hasActiveEngineerAssignment(tx, projectId, actor.id);
    if (!assigned) {
      throw new AppError('FORBIDDEN', 'يجب أن يكون المهندس معيناً على المشروع لإدارة مرفقات أمر التغيير');
    }
    if (vo.project.status === ProjectStatus.CANCELLED) {
      throw new AppError('INVALID_PROJECT_STATUS', 'لا يمكن تعديل مرفقات أمر تغيير لمشروع ملغي');
    }
    if (vo.status !== VariationOrderStatus.DRAFT) {
      throw new AppError(
        'ATTACHMENT_LOCKED_BY_PARENT_STATUS',
        `لا يمكن إضافة أو استبدال أو إلغاء المرفقات لأن حالة أمر التغيير الحالية (${vo.status}) مقفلة`,
      );
    }
  }

  return {
    ownerType: AttachmentOwnerType.VARIATION_ORDER,
    ownerId: vo.id,
    projectId: vo.projectId,
    projectStatus: vo.project.status,
    parentStatus: vo.status,
    authorUserId: vo.createdById,
    lifecycleState: deriveAttachmentLifecycleState(vo.status),
  };
}
