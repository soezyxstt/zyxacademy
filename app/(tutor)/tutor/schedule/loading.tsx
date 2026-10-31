import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function TutorScheduleLoading() {
  return (
    <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-56" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-28" /></div>
      </div>
      <div className="flex flex-wrap gap-2"><Skeleton className="h-9 min-w-[140px] max-w-sm flex-1" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-36" /></div>
      <Skeleton className="h-10 w-72 max-w-full" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex justify-between border-b border-border p-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-7 divide-x divide-border">
          {Array.from({ length: 7 }, (_, day) => <div key={day} className="space-y-4 p-2"><Skeleton className="mx-auto h-4 w-full max-w-16" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}
        </div>
      </div>
    </ApplicationPage>
  );
}
