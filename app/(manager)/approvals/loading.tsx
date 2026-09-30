/**
 * app/(manager)/approvals/loading.tsx
 *
 * Route-segment streaming loading UI for the Manager Approvals Hub.
 * Automatically wraps page streaming via Next.js App Router conventions.
 */

import { ApprovalsSkeleton } from './components/approvals-skeleton';

export default function ApprovalsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">مركز الموافقات</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          جاري تحميل المعاملات المعلقة...
        </p>
      </div>
      <ApprovalsSkeleton />
    </div>
  );
}
