'use client';

import { useRouter } from 'next/navigation';

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

interface ProjectFilterSelectProps {
  projects: ProjectOption[];
  currentProjectId?: string | undefined;
  currentStatus?: string | undefined;
}

export function ProjectFilterSelect({
  projects,
  currentProjectId,
  currentStatus,
}: ProjectFilterSelectProps) {
  const router = useRouter();

  function handleChange(val: string) {
    const q = new URLSearchParams();
    if (val) q.set('projectId', val);
    if (currentStatus) q.set('status', currentStatus);
    const qs = q.toString();
    router.push(qs ? `/progress-reports?${qs}` : '/progress-reports');
  }

  return (
    <select
      id="filter-project"
      value={currentProjectId ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      data-testid="project-filter-select"
    >
      <option value="">جميع المشاريع</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.code})
        </option>
      ))}
    </select>
  );
}
