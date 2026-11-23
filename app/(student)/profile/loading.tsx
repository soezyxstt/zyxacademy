import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentProfileLoading() {
  return (
    <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-4">
      {/* Mobile hub skeleton matching StudentProfileMobile */}
      <div className="space-y-4 md:hidden" aria-hidden="true">
        <div className="flex flex-col items-center gap-3 py-2">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Desktop profile skeleton */}
      <div className="hidden space-y-(--section-gap) md:block" aria-hidden="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 border-y border-border py-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      </div>
    </ApplicationPage>
  );
}
