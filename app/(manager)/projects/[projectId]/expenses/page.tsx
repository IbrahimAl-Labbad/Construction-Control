import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Receipt } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { getProjectExpenses } from '@/lib/expenses';
import { AppError } from '@/lib/errors';
import { ProjectExpensesView } from './components/project-expenses-view';

interface ProjectExpensesPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'مصروفات ونفقات المشروع',
  description: 'متابعة الإنفاق الفعلي واعتماد مطالبات المصروفات للمشروع',
};

export default async function ProjectExpensesPage({
  params,
}: ProjectExpensesPageProps) {
  const { projectId } = await params;
  const user = await requireManager();

  let overview;
  try {
    overview = await getProjectExpenses(projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Receipt className="size-6" aria-hidden="true" />
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
              <span className="text-foreground font-semibold">المصروفات والرقابة المالية</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              مصروفات ونفقات: {overview.projectName}
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
      <ProjectExpensesView
        initialOverview={overview}
        currentUserId={user.id}
      />
    </div>
  );
}
