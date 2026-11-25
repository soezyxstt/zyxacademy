import { ApplicationPage } from "@/components/application-page";
import { DiscussionWorkspaceSkeleton } from "@/components/discussions/discussion-skeleton";

export default function AdminDiscussionsLoading() {
  return (
    <ApplicationPage data-discussion-page spacing="space-y-2" className="px-0 pb-2 pt-0 sm:px-0 sm:pb-2 sm:pt-0 lg:px-0">
      <DiscussionWorkspaceSkeleton />
    </ApplicationPage>
  );
}
