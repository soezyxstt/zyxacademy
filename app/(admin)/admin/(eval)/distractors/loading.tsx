import { Skeleton } from "@/components/ui/skeleton";

export default function DistractorsLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-5"><div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-40" /></div>{Array.from({ length: 2 }, (_, i) => <div key={i} className="space-y-3 border-b border-border pb-6"><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-32" />{Array.from({ length: 4 }, (_, j) => <div key={j} className="space-y-1"><div className="flex justify-between"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-10" /></div><Skeleton className="h-1.5 w-full" /></div>)}</div>)}</div>;
}
