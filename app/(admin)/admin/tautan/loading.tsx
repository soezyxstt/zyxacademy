import { Skeleton } from "@/components/ui/skeleton";

export default function LinksLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-32" /></div><div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /></div><Skeleton className="h-9 w-28" /></div><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-3 p-4"><Skeleton className="size-10" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56 max-w-full" /></div><Skeleton className="size-8" /></div>)}</div></div>;
}
