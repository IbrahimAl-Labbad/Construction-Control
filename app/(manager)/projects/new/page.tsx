import type { Metadata } from 'next';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { CreateProjectForm } from '../components/create-project-form';

export const metadata: Metadata = {
  title: 'إنشاء مشروع جديد',
  description: 'إضافة مشروع جديد إلى النظام وتعيين المدير المسؤول',
};

export default async function NewProjectPage() {
  const currentActor = await requireManager();

  // Fetch all active, non-deleted managers to populate the selector
  const activeManagers = await prisma.user.findMany({
    where: {
      role: Role.MANAGER,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <CreateProjectForm
        managers={activeManagers}
        defaultManagerId={currentActor.id}
      />
    </div>
  );
}
