'use server';

/**
 * app/(manager)/projects/[projectId]/milestones/actions.ts
 *
 * Server Actions for Project Planning & Milestones operations.
 * Vertical Slice 12 — Project Planning & Milestones.
 * CR-08 / BD-17 Visual Progress & Milestone Evidence Linkage.
 *
 * Enforces AGENTS.md §7 & §26:
 * - Delegates all authorization and domain rules to application use cases.
 * - Maps use case errors to structured, client-safe action results.
 * - Revalidates affected Next.js paths.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireAuth } from '@/lib/permissions';
import { handleActionError } from '@/lib/errors';
import {
  createMilestone,
  updateMilestone,
  startMilestone,
  completeMilestone,
  cancelMilestone,
  deleteMilestone,
  reorderProjectMilestones,
  type ProjectMilestoneDTO,
} from '@/lib/milestones';
import {
  QUALIFIED_EVIDENCE_CATEGORIES,
  QUALIFIED_VISUAL_MIME_TYPES,
} from '@/lib/milestones/evidence-policy';

export type ActionSuccess<T> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export type ActionResult<T = ProjectMilestoneDTO> = ActionSuccess<T> | ActionFailure;

function handleUseCaseError(error: unknown): ActionFailure {
  return handleActionError(error, 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
}

export async function createMilestoneAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      projectId,
      title: formData.get('title'),
      description: formData.get('description'),
      targetDate: formData.get('targetDate'),
    };

    const created = await createMilestone(rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: created,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function updateMilestoneAction(
  projectId: string,
  milestoneId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      title: formData.get('title') || undefined,
      description: formData.get('description'),
      targetDate: formData.get('targetDate') || undefined,
    };

    const updated = await updateMilestone(milestoneId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function startMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const started = await startMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: started,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function completeMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const completed = await completeMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: completed,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function cancelMilestoneAction(
  projectId: string,
  milestoneId: string,
  formData: FormData,
): Promise<ActionResult<ProjectMilestoneDTO>> {
  try {
    const rawInput = {
      cancellationReason: formData.get('cancellationReason'),
    };

    const cancelled = await cancelMilestone(milestoneId, rawInput);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: cancelled,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function deleteMilestoneAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<{ success: true }>> {
  try {
    const result = await deleteMilestone(milestoneId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export async function reorderMilestonesAction(
  projectId: string,
  milestoneIds: string[],
): Promise<ActionResult<ProjectMilestoneDTO[]>> {
  try {
    const reordered = await reorderProjectMilestones({
      projectId,
      milestoneIds,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/milestones`);

    return {
      success: true,
      data: reordered,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}

export interface MilestoneEvidenceReportDTO {
  id: string;
  title: string;
  reportDate: string;
  status: string;
  authorName: string;
  attachments: Array<{
    id: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    category: string;
    createdAt: string;
  }>;
}

/**
 * Reads linked reports and qualified visual attachments for a milestone (CR-08).
 * Used by CompleteMilestoneDialog to display evidence previews and audit readiness.
 */
export async function getMilestoneEvidenceAction(
  projectId: string,
  milestoneId: string,
): Promise<ActionResult<MilestoneEvidenceReportDTO[]>> {
  try {
    await requireAuth();

    const milestone = await prisma.projectMilestone.findFirst({
      where: { id: milestoneId, projectId, deletedAt: null },
      select: { id: true },
    });

    if (!milestone) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'المحطة غير موجودة',
      };
    }

    const linkages = await prisma.progressReportMilestone.findMany({
      where: { milestoneId, projectId },
      include: {
        report: {
          select: {
            id: true,
            title: true,
            reportDate: true,
            status: true,
            createdBy: {
              select: { name: true },
            },
            deletedAt: true,
          },
        },
      },
      orderBy: { linkedAt: 'desc' },
    });

    const activeLinkages = linkages.filter((l) => l.report.deletedAt === null);
    const approvedReportIds = activeLinkages
      .filter((l) => l.report.status === 'APPROVED')
      .map((l) => l.report.id);

    const attachments =
      approvedReportIds.length > 0
        ? await prisma.attachment.findMany({
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
              originalFileName: true,
              mimeType: true,
              sizeBytes: true,
              category: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    const attachmentsByReportId = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = attachmentsByReportId.get(att.ownerId) ?? [];
      list.push(att);
      attachmentsByReportId.set(att.ownerId, list);
    }

    const data: MilestoneEvidenceReportDTO[] = activeLinkages.map((l) => {
      const repAttachments = attachmentsByReportId.get(l.report.id) ?? [];
      const reportDateStr =
        l.report.reportDate instanceof Date
          ? l.report.reportDate.toISOString().slice(0, 10)
          : String(l.report.reportDate);

      return {
        id: l.report.id,
        title: l.report.title,
        reportDate: reportDateStr,
        status: l.report.status,
        authorName: l.report.createdBy.name,
        attachments: repAttachments.map((a) => ({
          id: a.id,
          originalFileName: a.originalFileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          category: a.category,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    return handleUseCaseError(error);
  }
}
