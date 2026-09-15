'use client';

import Link from 'next/link';
import { FolderKanban, ExternalLink } from 'lucide-react';
import { ProjectStatusBadge } from './project-status-badge';
import type { ProjectSummary } from '@/lib/projects';

export interface ProjectListTableProps {
  initialProjects: ProjectSummary[];
}

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function ProjectListTable({ initialProjects }: ProjectListTableProps) {
  if (initialProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FolderKanban className="size-6" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">لا توجد مشاريع مسجلة</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          لم يتم إنشاء أي مشروع حتى الآن. اضغط على زر "إنشاء مشروع جديد" للبدء.
        </p>
        <Link
          href="/projects/new"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          إنشاء مشروع جديد
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-start text-sm text-foreground" data-testid="projects-table">
        <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-start">
              كود المشروع
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              اسم المشروع
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              مدير المشروع
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              الحالة
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              تاريخ البدء
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              تاريخ الانتهاء
            </th>
            <th scope="col" className="px-4 py-3 text-start">
              الإجراءات
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {initialProjects.map((project) => (
            <tr
              key={project.id}
              className="hover:bg-muted/30 transition-colors"
              data-testid={`project-row-${project.code}`}
            >
              <td className="px-4 py-3 font-mono font-medium text-foreground">
                {project.code}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {project.name}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {project.manager.name}
              </td>
              <td className="px-4 py-3">
                <ProjectStatusBadge status={project.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(project.startDate)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(project.endDate)}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/projects/${project.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  data-testid={`view-project-${project.code}`}
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  تفاصيل المشروع
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
