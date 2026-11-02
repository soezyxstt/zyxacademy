import { Skeleton } from "@/components/ui/skeleton";

export function BlogEditorLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><div className="grid grid-cols-1 gap-8 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full rounded-xl" /></div><div className="space-y-4 rounded-xl border border-border bg-card p-5"><Skeleton className="h-5 w-32" />{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>)}</div></div></div>;
}
