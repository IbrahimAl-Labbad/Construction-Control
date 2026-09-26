/**
 * lib/milestones/use-cases/internal-lock.ts
 *
 * Internal helper: Acquires PostgreSQL parent-row lock on the Project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - BD-12-08: Parent Project serialization for ordering and mutations.
 * - BD-12-09: Mutations permitted ONLY on projects with status in [PLANNED, ACTIVE].
 * - Rejects with INVALID_PROJECT_STATUS if project is ON_HOLD, COMPLETED, or CANCELLED.
 * - Rejects with NOT_FOUND if project does not exist or is soft-deleted.
 */

import type { Prisma } from '@prisma/client';
import { ProjectStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';

export async function lockProjectForMilestoneMutation(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  const projectTouch = await tx.project.updateMany({
    where: {
      id: projectId,
      status: {
        in: [ProjectStatus.PLANNED, ProjectStatus.ACTIVE],
      },
      deletedAt: null,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  if (projectTouch.count === 0) {
    const prj = await tx.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { status: true },
    });

    if (!prj) {
      throw new AppError('NOT_FOUND', 'المشروع غير موجود');
    }

    throw new AppError(
      'INVALID_PROJECT_STATUS',
      `لا يمكن تعديل معالم مشروع بحالة "${prj.status}". التعديل متاح فقط للمشاريع قيد التخطيط أو النشطة.`,
    );
  }
}
