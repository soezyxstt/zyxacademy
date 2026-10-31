import { Skeleton } from "@/components/ui/skeleton";

export function FormsBuilderSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="grid items-start gap-4 md:grid-cols-12">
        <div className="space-y-4 md:col-span-9">
          <div className="space-y-3 rounded-xl border border-border bg-card p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-full" /></div>
          {[0, 1].map((i) => <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-9 w-full" /><Skeleton className="h-4 w-1/3" /></div>)}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 md:col-span-3"><Skeleton className="h-5 w-28" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
      </div>
    </div>
  );
}
