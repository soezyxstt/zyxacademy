import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-36" /></div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2 bg-card p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-12" /><Skeleton className="h-3 w-28 max-w-full" /></div>)}</div>
      <div className="flex flex-wrap gap-2"><Skeleton className="h-9 min-w-[140px] flex-1" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-28" /></div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 border-b border-border p-4 last:border-0"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-24" /></div><Skeleton className="hidden h-4 w-24 sm:block" /><Skeleton className="h-5 w-16" /><Skeleton className="size-8 shrink-0" /></div>)}</div>
    </div>
  );
}
