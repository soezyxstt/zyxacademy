import { Skeleton } from "@/components/ui/skeleton";

export default function PkaSchedulesLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><Skeleton className="h-10 w-80 max-w-full" /><div className="flex justify-end"><Skeleton className="h-9 w-32" /></div><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex flex-wrap items-center gap-4 p-4"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-48" /></div><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></div>)}</div></div>;
}
