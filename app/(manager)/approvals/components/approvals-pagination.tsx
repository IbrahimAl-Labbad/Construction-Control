/**
 * app/(manager)/approvals/components/approvals-pagination.tsx
 *
 * Pagination controls for domain-specific tabs in the Approvals Hub.
 * Not rendered on the All tab.
 *
 * Follows Slice 15 Design Spec §8.
 */

import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { ApprovalsTab } from '@/lib/approvals';

interface ApprovalsPaginationProps {
  page: number;
  totalPages: number;
  tab: ApprovalsTab;
}

export function ApprovalsPagination({
  page,
  totalPages,
  tab,
}: ApprovalsPaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div
      className="flex items-center justify-between border-t border-border pt-4 text-xs"
      data-testid="approvals-pagination"
    >
      <div>
        {hasPrev ? (
          <Link
            href={`/approvals?tab=${tab}&page=${page - 1}`}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted transition-colors"
            data-testid="pagination-prev"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
            السابق
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-input/40 bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground/50 cursor-not-allowed"
            data-testid="pagination-prev-disabled"
            aria-disabled="true"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
            السابق
          </span>
        )}
      </div>

      <span className="text-muted-foreground font-medium">
        صفحة {page} من {totalPages}
      </span>

      <div>
        {hasNext ? (
          <Link
            href={`/approvals?tab=${tab}&page=${page + 1}`}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted transition-colors"
            data-testid="pagination-next"
          >
            التالي
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-input/40 bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground/50 cursor-not-allowed"
            data-testid="pagination-next-disabled"
            aria-disabled="true"
          >
            التالي
            <ChevronLeft className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
