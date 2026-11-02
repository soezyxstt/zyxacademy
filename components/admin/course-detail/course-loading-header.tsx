import { Skeleton } from "@/components/ui/skeleton";

export function CourseLoadingHeader() {
  return <div className="space-y-3 border-b border-border pb-4"><div className="flex gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-28" /></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Skeleton className="size-9" /><Skeleton className="h-7 w-48" /></div><div className="flex gap-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-20" /><Skeleton className="h-8 w-28" /></div></div></div>;
}
