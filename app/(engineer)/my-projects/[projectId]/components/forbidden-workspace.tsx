import Link from 'next/link';
import { ShieldX, ArrowRight } from 'lucide-react';

export function ForbiddenWorkspace() {
  return (
    <div
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center text-center p-6"
      data-testid="unassigned-forbidden-alert"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
        <ShieldX className="size-8" aria-hidden="true" />
      </div>

      <h1 className="text-xl font-bold text-foreground">غير مصرح بالدخول لمساحة هذا المشروع</h1>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        لا يمكنك الوصول إلى بيانات هذا المشروع التشغيلية أو محطاته لأنك لست معيناً ضمن فريقه الهندسي المعتمد من قبل مدير المشاريع.
      </p>

      <div className="mt-6">
        <Link
          href="/my-projects"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          <span>العودة إلى مشاريعي</span>
        </Link>
      </div>
    </div>
  );
}
