import type { Metadata } from 'next';
import { Role } from '@prisma/client';

import { requireAuth } from '@/lib/permissions';
import {
  getUserCommitments,
  getActiveProjectsForCommitments,
} from '@/lib/commitments';
import { UserCommitmentsView } from './components/user-commitments-view';

export const metadata: Metadata = {
  title: 'الارتباطات المالية وأوامر الشراء',
  description: 'إدارة وتتبع الارتباطات التعاقدية وأوامر الشراء مقابل بنود الموازنة',
};

export default async function CommitmentsPage() {
  // Enforces authenticated session
  const user = await requireAuth();

  const canCreate = user.role === Role.PURCHASING;

  const [commitments, activeProjects] = await Promise.all([
    getUserCommitments(),
    canCreate ? getActiveProjectsForCommitments().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <UserCommitmentsView
          initialCommitments={commitments}
          activeProjects={activeProjects}
          canCreate={canCreate}
        />
      </main>
    </div>
  );
}
