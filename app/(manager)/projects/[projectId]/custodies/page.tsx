import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Wallet } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProjectCustodies } from '@/lib/custodies';
import { AppError } from '@/lib/errors';
import { ProjectCustodiesView } from './components/project-custodies-view';

interface ProjectCustodiesPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'العهد النقدية للمشروع | Construction Control',
  description: 'متابعة العهد النقدية التشغيلية واعتمادها وتصفيتها للمشروع',
};

export default async function ProjectCustodiesPage({
  params,
}: ProjectCustodiesPageProps) {
  const { projectId } = await params;
  const user = await requireManager();

  let overview;
  try {
    overview = await getProjectCustodies(projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Wallet className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/projects" className="hover:text-foreground transition-colors">
                المشاريع
              </Link>
              <span>/</span>
              <Link
                href={`/projects/${overview.projectId}`}
                className="hover:text-foreground transition-colors font-mono"
              >
                {overview.projectCode}
              </Link>
              <span>/</span>
              <span className="text-foreground font-semibold">العهد النقدية والتسويات</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              العهد النقدية التشغيلية: {overview.projectName}
            </h1>
          </div>
        </div>

        {/* Back Link */}
        <Link
          href={`/projects/${overview.projectId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted shrink-0"
          data-testid="back-to-project-button"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          <span>العودة لبيانات المشروع</span>
        </Link>
      </div>

      {/* Main View */}
      <ProjectCustodiesView
        initialOverview={overview}
        currentUserId={user.id}
      />
    </div>
  );
}
