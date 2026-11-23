import { ApplicationPage } from "@/components/application-page";
import {
  DashboardPrimaryLearningSkeleton,
  DashboardSectionSkeleton,
} from "./dashboard-skeletons";

export default function DashboardLoading() {
  return (
    <ApplicationPage className="pb-16">
      <div className="grid w-full min-w-0 gap-5 md:gap-(--section-gap) lg:grid-cols-12" aria-hidden="true">
        <div className="min-w-0 space-y-5 md:space-y-(--section-gap) lg:col-span-7">
          <DashboardPrimaryLearningSkeleton count={2} />
        </div>
        <div className="min-w-0 space-y-5 md:space-y-(--section-gap) lg:col-span-5">
          <DashboardSectionSkeleton rows={3} />
          <DashboardSectionSkeleton rows={2} />
        </div>
      </div>
    </ApplicationPage>
  );
}
