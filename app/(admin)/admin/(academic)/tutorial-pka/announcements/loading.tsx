import { Skeleton } from "@/components/ui/skeleton";

export default function AnnouncementsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--related-gap)">
      <Skeleton className="h-9 w-80 max-w-full" />
      <div className="space-y-(--compact-gap)">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>
      <Skeleton className="h-5 w-36" />
      <div className="divide-y divide-border/60 border-y border-border/60">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2 py-(--row-padding)">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
