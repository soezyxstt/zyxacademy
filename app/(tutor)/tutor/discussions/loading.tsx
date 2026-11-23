import { ApplicationPage } from "@/components/application-page";
import { DiscussionWorkspaceSkeleton } from "@/components/discussions/discussion-skeleton";

export default function TutorDiscussionsLoading() {
  return (
    <ApplicationPage data-discussion-page spacing="space-y-2" className="pb-2 pt-2 sm:pb-3 sm:pt-3">
      <DiscussionWorkspaceSkeleton />
    </ApplicationPage>
  );
}
