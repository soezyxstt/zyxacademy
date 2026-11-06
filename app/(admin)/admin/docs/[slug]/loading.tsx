import { Skeleton } from "@/components/ui/skeleton";

export default function DocLoading() {
  return (
    <div role="status" aria-label="Memuat" className="max-w-3xl space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-80 max-w-full" />
      </div>
      <Skeleton className="h-4 w-4/5" />
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
