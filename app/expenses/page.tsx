import type { Metadata } from 'next';
import { Role } from '@prisma/client';

import { requireRole } from '@/lib/permissions';
import {
  getUserExpenses,
  getActiveProjectsForExpenses,
} from '@/lib/expenses';
import { UserExpensesView } from './components/user-expenses-view';

export const metadata: Metadata = {
  title: 'مطالبات ومصروفات الموقع',
  description: 'تسجيل ومتابعة مطالبات ونفقات الموقع الميدانية',
};

export default async function ExpensesPage() {
  // Enforces authorization: Engineer, Accountant, or Manager
  await requireRole([Role.ENGINEER, Role.ACCOUNTANT, Role.MANAGER]);

  const [expenses, activeProjects] = await Promise.all([
    getUserExpenses(),
    getActiveProjectsForExpenses().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <UserExpensesView
          initialExpenses={expenses}
          activeProjects={activeProjects}
        />
      </main>
    </div>
  );
}
