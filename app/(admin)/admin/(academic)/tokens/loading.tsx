import { Skeleton } from "@/components/ui/skeleton";

export default function TokensLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-36" /></div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2 bg-card p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-12" /></div>)}
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>)}</div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex gap-2 border-b border-border p-4"><Skeleton className="h-9 max-w-sm flex-1" /><Skeleton className="h-9 w-28" /></div>{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-4 border-b border-border p-4 last:border-0"><Skeleton className="h-4 w-40" /><Skeleton className="hidden h-4 w-28 sm:block" /><Skeleton className="ml-auto h-4 w-16" /></div>)}</div>
    </div>
  );
}
