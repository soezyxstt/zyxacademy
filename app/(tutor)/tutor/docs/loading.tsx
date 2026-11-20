import { Skeleton } from "@/components/ui/skeleton";

export default function TutorDocsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="max-w-3xl space-y-(--section-gap)">
      <Skeleton className="h-9 w-full" />
      {[0, 1].map((section) => (
        <div key={section} className="space-y-2.5">
          <Skeleton className="h-5 w-44" />
          <div className="divide-y divide-border border-y border-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2 py-(--row-padding)">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
