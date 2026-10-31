import { CourseLoadingHeader } from "@/components/admin/course-detail/course-loading-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-4"><CourseLoadingHeader /><div className="space-y-4 rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="space-y-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>)}</div><Skeleton className="h-9 w-24" /></div><div className="space-y-3 rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-32" /></div></div>;
}
