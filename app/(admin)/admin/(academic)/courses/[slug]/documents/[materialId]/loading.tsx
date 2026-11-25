import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentWorkspaceLoading() {
  return (
    <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--section-gap)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <Skeleton className="h-4 w-48 max-w-full" />
        <div className="ml-auto flex gap-1.5">
          <Skeleton className="size-8" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="mx-auto max-w-[75ch] space-y-(--related-gap)">
        <Skeleton className="h-7 w-3/4" />
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
