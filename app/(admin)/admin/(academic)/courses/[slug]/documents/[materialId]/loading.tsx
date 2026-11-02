import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentWorkspaceLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div className="space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-7 w-56" /></div><div className="flex gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /></div></div><Skeleton className="h-10 w-56" /><div className="mx-auto max-w-[75ch] space-y-4 py-6"><Skeleton className="h-7 w-3/4" />{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div></div>;
}
