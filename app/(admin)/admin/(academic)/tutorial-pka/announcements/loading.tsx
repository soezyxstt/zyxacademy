import { Skeleton } from "@/components/ui/skeleton";

export default function AnnouncementsLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><Skeleton className="h-10 w-80 max-w-full" /><div className="space-y-4 rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-9 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-9 w-32" /></div><Skeleton className="h-5 w-36" /><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>)}</div></div>;
}
