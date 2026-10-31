import { CourseLoadingHeader } from "@/components/admin/course-detail/course-loading-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function FlashcardsLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-6"><CourseLoadingHeader /><div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2 bg-card p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-12" /><Skeleton className="h-3 w-28 max-w-full" /></div>)}</div><div className="flex flex-wrap gap-2"><Skeleton className="h-9 min-w-[140px] max-w-sm flex-1" /><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-28" /></div><div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-28" /></div><Skeleton className="size-8" /></div>)}</div></div>;
}
