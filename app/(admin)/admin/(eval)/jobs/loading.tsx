import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-44" /></div>
      <div className="flex items-center justify-between gap-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-32" /></div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-36" /></div><Skeleton className="h-6 w-20" /><Skeleton className="size-8" /></div>)}</div>
    </div>
  );
}
