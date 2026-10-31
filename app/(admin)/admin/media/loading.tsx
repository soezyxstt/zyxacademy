import { Skeleton } from "@/components/ui/skeleton";

export default function MediaLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-36" /></div><Skeleton className="h-10 w-52" /><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-9 w-32" /></div><Skeleton className="h-24 w-full rounded-xl" /><div className="flex gap-4"><div className="hidden w-48 shrink-0 space-y-3 border-r border-border pr-3 lg:block">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div><div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-9 w-full" /><div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div></div></div></div>;
}
