import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardPrimaryLearningSkeleton,
  DashboardSectionSkeleton,
} from "./dashboard-skeletons";

export default function DashboardLoading() {
  return (
    <ApplicationPage className="pb-16">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="hidden sm:block h-9 w-32 rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12 w-full min-w-0">
        <div className="space-y-6 lg:col-span-7 min-w-0">
          <DashboardPrimaryLearningSkeleton count={2} />
        </div>
        <div className="space-y-6 lg:col-span-5 min-w-0">
          <DashboardSectionSkeleton rows={3} />
          <DashboardSectionSkeleton rows={2} />
          <DashboardSectionSkeleton rows={2} />
        </div>
      </div>
    </ApplicationPage>
  );
}
