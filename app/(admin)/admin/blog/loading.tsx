import { Skeleton } from "@/components/ui/skeleton";

export default function BlogLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div className="flex items-center gap-3"><Skeleton className="size-9" /><Skeleton className="h-7 w-36" /></div><Skeleton className="h-9 w-28" /></div><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-4 min-w-0 flex-1" /><Skeleton className="hidden h-5 w-20 sm:block" /><Skeleton className="h-5 w-16" /><Skeleton className="hidden h-4 w-24 md:block" /><Skeleton className="h-8 w-16" /></div>)}</div></div>;
}
