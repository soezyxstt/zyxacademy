import { ApplicationPage } from "@/components/application-page";
import { DiscussionWorkspaceSkeleton } from "@/components/discussions/discussion-skeleton";
import { getTranslations } from "@/lib/i18n/server";

export default async function TutorDiscussionsLoading() {
  const t = await getTranslations("discussions");
  return (
    <ApplicationPage data-discussion-page spacing="space-y-(--compact-gap)" className="pb-2 pt-2 sm:pb-3 sm:pt-3">
      <DiscussionWorkspaceSkeleton label={t("loadingThread")} />
    </ApplicationPage>
  );
}
