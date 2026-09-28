import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { getEngineerAssignedProjects } from '@/lib/engineer-workspace';
import { ProjectCard } from './components/project-card';

export const metadata: Metadata = {
  title: 'مشاريعي الميدانية',
  description: 'المشاريع الإنشائية المعين بها كمهندس موقع ومساحات العمليات الميدانية المخصصة لها',
};

interface MyProjectsPageProps {
  searchParams: Promise<{ terminal?: string }>;
}

export default async function MyProjectsPage({ searchParams }: MyProjectsPageProps) {
  const params = await searchParams;
  const includeTerminal = params.terminal === 'true';

  const projects = await getEngineerAssignedProjects({ includeTerminal });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">
              مشاريعي الميدانية
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              استعراض المشاريع المعين بها ومتابعة محطاتها وعملياتك الميدانية
            </p>
          </div>
        </div>

        {/* Filter Switcher */}
        <div className="flex items-center rounded-lg bg-muted p-1 border border-border/60">
          <Link
            href="/my-projects"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              !includeTerminal
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="filter-active-projects"
          >
            المشاريع الجارية
          </Link>
          <Link
            href="/my-projects?terminal=true"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              includeTerminal
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="filter-all-projects"
          >
            الكل (بما فيها المكتملة)
          </Link>
        </div>
      </div>

      {/* Projects Grid or Empty State */}
      {projects.length === 0 ? (
        <div
          className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"
          data-testid="empty-projects-state"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FolderKanban className="size-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground">لا توجد مشاريع معينة حالياً</h2>
          <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
            {includeTerminal
              ? 'لم يتم العثور على أي مشاريع معينة لك في النظام.'
              : 'ليس لديك أي مشاريع جارية معينة لك حالياً من قِبل إدارة المشاريع. يمكنك مراجعة المشاريع المكتملة بالضغط على تبويب الكل أعلاه.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="projects-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
