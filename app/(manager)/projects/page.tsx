import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban, Plus } from 'lucide-react';

import { requireManager } from '@/lib/permissions';
import { listProjects } from '@/lib/projects';
import { ProjectListTable } from './components/project-list-table';

export const metadata: Metadata = {
  title: 'إدارة المشاريع',
  description: 'استعراض ومتابعة المشاريع والبيانات التشغيلية',
};

export default async function ProjectsPage() {
  await requireManager();
  const projects = await listProjects();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة المشاريع</h1>
            <p className="text-sm text-muted-foreground">
              متابعة وإشراف على كافة المشاريع والبيانات التشغيلية
            </p>
          </div>
        </div>

        <div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="new-project-button"
          >
            <Plus className="size-4" aria-hidden="true" />
            إنشاء مشروع جديد
          </Link>
        </div>
      </div>

      {/* Projects Table */}
      <section aria-labelledby="projects-list-heading">
        <h2 id="projects-list-heading" className="sr-only">
          قائمة المشاريع
        </h2>
        <ProjectListTable initialProjects={projects} />
      </section>
    </div>
  );
}
