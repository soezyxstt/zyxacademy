import { Skeleton } from "@/components/ui/skeleton";

export default function DocsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="max-w-4xl space-y-6">
      <div className="hidden items-center gap-3 md:flex">
        <Skeleton className="size-9" />
        <Skeleton className="h-7 w-52" />
      </div>
      <Skeleton className="h-9 w-full" />
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <div className="divide-y divide-border border-y border-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2 py-3">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
