/**
 * app/(manager)/approvals/components/approvals-skeleton.tsx
 *
 * Loading skeleton shimmer cards for the Approvals Hub.
 * Rendered by app/(manager)/approvals/loading.tsx during data streaming.
 */

export function ApprovalsSkeleton() {
  return (
    <div
      className="space-y-6 animate-pulse"
      data-testid="approvals-skeleton"
      aria-busy="true"
      aria-label="جاري تحميل المعاملات..."
    >
      {/* Tab bar skeleton */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-muted" />
        ))}
      </div>

      {/* Cards list skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-5 w-16 rounded-full bg-muted" />
                <div className="h-5 w-32 rounded bg-muted" />
              </div>
              <div className="h-6 w-20 rounded bg-muted" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-4 w-64 rounded bg-muted sm:col-span-2" />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/60">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-16 rounded bg-muted" />
                <div className="h-8 w-20 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
