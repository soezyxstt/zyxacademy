import { TranslatedText } from "@/components/i18n/translated-text";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardHeaderShell({ firstName }: { firstName: string }) {
  return (
    <div className="mb-4 sm:mb-6">
      <PageHeader
        title={
          <>
            <TranslatedText namespace="student" messageKey="dashboard.helloPrefix" />
            {", "}
            <span className="text-primary">{firstName}</span>
          </>
        }
        actions={
          <div className="hidden sm:block">
            <div className="h-9 w-32 animate-pulse rounded-xl bg-muted" />
          </div>
        }
      />
    </div>
  );
}

export function DashboardSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="divide-y divide-border/30">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-2 py-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPrimaryLearningSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-6" aria-hidden="true">
      <DashboardSectionSkeleton rows={Math.min(Math.max(count, 1), 3)} />
      <DashboardSectionSkeleton rows={2} />
    </div>
  );
}

export function DashboardOnboardingSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <DashboardSectionSkeleton rows={3} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
