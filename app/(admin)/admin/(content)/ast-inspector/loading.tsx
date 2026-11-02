import { Skeleton } from "@/components/ui/skeleton";

export default function InspectorLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-4"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><div className="flex h-[calc(100vh-250px)] flex-col overflow-hidden rounded-xl border border-border md:flex-row"><div className="flex min-h-80 flex-1 flex-col border-b border-border p-4 md:border-b-0 md:border-r"><Skeleton className="h-8 w-40" /><div className="mt-4 space-y-2">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-4 w-4/5" />)}</div></div><div className="flex-1 space-y-4 p-4"><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div></div></div>;
}
