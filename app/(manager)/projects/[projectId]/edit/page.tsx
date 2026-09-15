import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FolderKanban } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProject } from '@/lib/projects';
import { AppError } from '@/lib/errors';
import { EditProjectForm } from '../../components/edit-project-form';

interface EditProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'تعديل بيانات المشروع',
  description: 'تعديل الاسم والوصف والموقع والتواريخ للمشروع',
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { projectId } = await params;
  await requireManager();

  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="font-mono text-xs font-semibold text-primary">{project.code}</div>
            <h1 className="text-xl font-bold text-foreground">تعديل بيانات المشروع</h1>
          </div>
        </div>

        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted"
          data-testid="back-to-project-detail-button"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          العودة لتفاصيل المشروع
        </Link>
      </div>

      {/* Edit Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <EditProjectForm project={project} />
      </div>
    </div>
  );
}
