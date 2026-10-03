import type { Metadata } from 'next';
import { Role } from '@prisma/client';

import { requireAuth } from '@/lib/permissions';
import {
  getUserCustodies,
  getActiveProjectsForCustodies,
  calculateUserCustodiesTotals,
} from '@/lib/custodies';
import { UserCustodiesView } from './components/user-custodies-view';

export const metadata: Metadata = {
  title: 'العهد النقدية وتصفيتها | Construction Control',
  description: 'إدارة وتتبع السلف والعهد النقدية التشغيلية وتسويتها بالمصروفات الفعلية',
};

export default async function CustodiesPage() {
  const user = await requireAuth();

  const canCreate = user.role === Role.ENGINEER || user.role === Role.ACCOUNTANT;
  const isAccountant = user.role === Role.ACCOUNTANT;
  const isManager = user.role === Role.MANAGER;

  const [custodies, formData] = await Promise.all([
    getUserCustodies(),
    canCreate
      ? getActiveProjectsForCustodies().catch(() => ({ projects: [], custodians: [] }))
      : Promise.resolve({ projects: [], custodians: [] }),
  ]);

  const totals = calculateUserCustodiesTotals(custodies);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <UserCustodiesView
          initialCustodies={custodies}
          initialTotals={totals}
          formData={formData}
          canCreate={canCreate}
          isAccountant={isAccountant}
          isManager={isManager}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
