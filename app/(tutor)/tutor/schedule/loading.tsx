import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function TutorScheduleLoading() {
  return (
    <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-(--related-gap)">
      {/* Mobile week-strip & daily agenda skeleton */}
      <div className="space-y-3 md:hidden" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="size-10 rounded-xl" />
        </div>
        <div className="grid grid-cols-7 gap-1 border-b border-border/60 pb-3">
          {Array.from({ length: 7 }, (_, day) => (
            <Skeleton key={day} className="h-14 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-2.5 pt-1">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>

      {/* Desktop 7-column schedule skeleton */}
      <div className="hidden space-y-(--related-gap) md:block" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-24" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-9 w-12" />
            <Skeleton className="size-9" />
            <Skeleton className="size-9" />
          </div>
        </div>
        <div className="border-y border-border">
          <div className="flex justify-between border-b border-border p-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-24" /></div>
          <div className="grid grid-cols-7 divide-x divide-border">
            {Array.from({ length: 7 }, (_, day) => <div key={day} className="space-y-(--related-gap) p-2"><Skeleton className="mx-auto h-4 w-full max-w-16" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}
          </div>
        </div>
      </div>
    </ApplicationPage>
  );
}
