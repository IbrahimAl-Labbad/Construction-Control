import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions';
import { getEngineerProjectWorkspace } from '@/lib/engineer-workspace';
import { WorkspaceHeader } from './components/workspace-header';
import { WorkspaceClient } from './components/workspace-client';
import { ForbiddenWorkspace } from './components/forbidden-workspace';

interface EngineerProjectWorkspacePageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: 'مساحة العمل الميدانية للمشروع',
  description: 'متابعة محطات المشروع والتقارير الميدانية والمصاريف والعهد الخاصة بالمهندس',
};

export default async function EngineerProjectWorkspacePage({
  params,
}: EngineerProjectWorkspacePageProps) {
  const { projectId } = await params;

  try {
    const workspace = await getEngineerProjectWorkspace(projectId);

    return (
      <div className="space-y-6" data-testid="engineer-project-workspace">
        <WorkspaceHeader project={workspace.project} />
        <WorkspaceClient workspace={workspace} />
      </div>
    );
  } catch (error) {
    if (error instanceof PermissionError) {
      return <ForbiddenWorkspace />;
    }
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }
}
