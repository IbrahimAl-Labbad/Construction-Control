import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FolderKanban } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProject } from '@/lib/projects';
import { getProjectBudget } from '@/lib/budget';
import { AppError } from '@/lib/errors';
import { BudgetView } from './components/budget-view';

interface BudgetPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'الموازنة التقديرية للمشروع',
  description: 'إدارة خط الأساس المالي وبنود التكلفة التقديرية للمشروع',
};

export default async function ProjectBudgetPage({ params }: BudgetPageProps) {
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

  const budget = await getProjectBudget(projectId);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Navigation Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/projects"
                className="hover:text-foreground transition-colors"
              >
                المشاريع
              </Link>
              <span>/</span>
              <Link
                href={`/projects/${project.id}`}
                className="hover:text-foreground transition-colors font-mono"
              >
                {project.code}
              </Link>
              <span>/</span>
              <span className="text-foreground font-semibold">الموازنة التقديرية</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              موازنة المشروع: {project.name}
            </h1>
          </div>
        </div>

        {/* Back Link to Project Details */}
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted"
          data-testid="back-to-project-details-button"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          <span>العودة لبيانات المشروع</span>
        </Link>
      </div>

      {/* Main Budget View */}
      <BudgetView
        projectId={project.id}
        initialBudget={budget}
        projectStatus={project.status}
      />
    </div>
  );
}
