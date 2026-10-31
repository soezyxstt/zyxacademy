import { Skeleton } from "@/components/ui/skeleton";

export default function QuestionsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div className="flex items-center gap-3"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><div className="flex gap-2"><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-28" /></div></div>
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="flex flex-wrap gap-2"><Skeleton className="h-9 min-w-[140px] max-w-sm flex-1" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-28" /></div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-start gap-3 border-b border-border p-4 last:border-0"><Skeleton className="size-4 shrink-0" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /><div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-16" /></div></div><Skeleton className="size-8 shrink-0" /></div>)}</div>
    </div>
  );
}
