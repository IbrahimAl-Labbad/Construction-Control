/**
 * app/(manager)/approvals/components/all-tab-overflow-banner.tsx
 *
 * Information banner displayed on the All tab when total pending items exceed the display window.
 * Verbatim text from Slice 15 Design Spec §7.3.
 */

import { Info } from 'lucide-react';

interface AllTabOverflowBannerProps {
  totalCount: number;
  displayedCount: number;
}

export function AllTabOverflowBanner({
  totalCount,
  displayedCount,
}: AllTabOverflowBannerProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground"
      data-testid="all-tab-overflow-banner"
      role="status"
    >
      <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        يوجد {totalCount} معاملة معلقة إجمالاً. يعرض هذا العرض أقدم {displayedCount} معاملة. للمراجعة الكاملة، استخدم التبويبات المتخصصة.
      </p>
    </div>
  );
}
