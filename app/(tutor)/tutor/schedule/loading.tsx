import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";
import { TranslatedText } from "@/components/i18n/translated-text";

export default function TutorScheduleLoading() {
  return (
    <ApplicationPage role="status" spacing="space-y-(--related-gap)">
      <TranslatedText namespace="tutor.quizForm" messageKey="loading" className="sr-only" />
      {/* Mobile week-strip & daily agenda skeleton */}
      <div className="space-y-(--related-gap) md:hidden" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="size-9" />
        </div>
        <div className="grid grid-cols-7 gap-1 border-b border-border/60 pb-3">
          {Array.from({ length: 7 }, (_, day) => (
            <Skeleton key={day} className="h-14 w-full rounded-md" />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-40 max-w-full" />
          <Skeleton className="size-9 shrink-0" />
        </div>
        <div className="divide-y divide-border/55 border-y border-border/55">
          {[0, 1].map((row) => (
            <div key={row} className="flex items-start justify-between gap-2 py-(--row-padding)">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
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
