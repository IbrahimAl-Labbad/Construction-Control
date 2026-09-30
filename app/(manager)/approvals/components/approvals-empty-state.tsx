/**
 * app/(manager)/approvals/components/approvals-empty-state.tsx
 *
 * Empty state for the Approvals Hub.
 * Uses neutral wording that does not imply approval, rejection, or completion.
 *
 * Follows Slice 15 Design Spec §6.2.
 */

import { Inbox } from 'lucide-react';
import type { ApprovalsTab } from '@/lib/approvals';

interface ApprovalsEmptyStateProps {
  activeTab: ApprovalsTab;
}

export function ApprovalsEmptyState({ activeTab }: ApprovalsEmptyStateProps) {
  const message =
    activeTab === 'all'
      ? 'لا توجد معاملات معلقة حاليًا'
      : 'لا توجد معاملات معلقة حاليًا في هذا القسم';

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 px-4 text-center"
      data-testid="approvals-empty-state"
    >
      <div className="rounded-full bg-muted p-4 text-muted-foreground mb-3">
        <Inbox className="size-8" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {message}
      </h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        عند تقديم معاملات جديدة تتطلب موافقة المدير، ستظهر هنا مباشرة للمراجعة والاعتماد.
      </p>
    </div>
  );
}
