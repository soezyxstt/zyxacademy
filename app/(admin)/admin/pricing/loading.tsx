import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-6"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div><Skeleton className="h-10 w-80 max-w-full" /><div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="space-y-4 rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">{Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>)}</div><Skeleton className="h-9 w-32" /></div><div className="space-y-4 rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div></div></div>;
}
