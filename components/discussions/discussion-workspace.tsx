"use client";

import { useTranslations } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewportSwitch } from "@/components/navigation";
import { DiscussionProfileDialog } from "./discussion-profile-dialog";
import { DiscussionReports } from "./discussion-reports";
import type { DiscussionWorkspaceProps } from "./view-model";
import {
  discussionAudienceKey,
  discussionPrivacyKey,
  useDiscussionWorkspace,
  type DiscussionDraftState,
} from "@/features/discussions/model/use-discussion-workspace";
import { DiscussionWorkspaceDesktop } from "@/features/discussions/ui/desktop/discussion-workspace-desktop";
import { DiscussionWorkspaceMobile } from "@/features/discussions/ui/mobile/discussion-workspace-mobile";

export {
  discussionAudienceKey,
  discussionPrivacyKey,
  type DiscussionDraftState,
};

export function DiscussionWorkspace(
  props: DiscussionWorkspaceProps & { draftState?: DiscussionDraftState }
) {
  const t = useTranslations("discussions");
  const controller = useDiscussionWorkspace(props);

  return (
    <TooltipProvider>
      <div className="@container/discussions min-w-0" data-discussion-workspace>
        {props.readError && (
          <div role="alert" className="mb-3 flex items-center gap-2 text-body-xs">
            {t("readError")}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={props.onRetryRead}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        <Tabs
          value={controller.activeTab}
          onValueChange={(tab) => controller.changeTab(tab as "questions" | "reports")}
        >
          {controller.canReport && (
            <TabsList className="mb-2">
              <TabsTrigger value="questions">{t("questions")}</TabsTrigger>
              <TabsTrigger value="reports">
                {t("reports")}
                {props.reports!.some((report) => report.status === "pending") && (
                  <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-body-xs text-primary">
                    {
                      props.reports!.filter((report) => report.status === "pending")
                        .length
                    }
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="questions" className="mt-0">
            <ViewportSwitch
              desktop={() => (
                <DiscussionWorkspaceDesktop props={props} controller={controller} />
              )}
              mobile={() => (
                <DiscussionWorkspaceMobile props={props} controller={controller} />
              )}
              fallback={
                <DiscussionWorkspaceDesktop props={props} controller={controller} />
              }
            />
          </TabsContent>
          {controller.canReport && (
            <TabsContent value="reports">
              <DiscussionReports
                state={props.reportState}
                onRetry={props.onRetryReports}
                reports={props.reports!}
                onSetStatus={props.onSetReportStatus}
                onOpenQuestion={(id, messageId) => {
                  if (!props.onTabChange) controller.setUrlTab("questions");
                  controller.selectQuestion(id, messageId);
                }}
              />
            </TabsContent>
          )}
        </Tabs>
        <DiscussionProfileDialog
          open={!!controller.profileTarget}
          onOpenChange={(open) => {
            if (!open) controller.setProfileTarget(null);
          }}
          author={controller.profileTarget?.author ?? null}
          loadProfile={
            controller.loadAuthorProfile && controller.profileQuestionId
              ? controller.loadProfile
              : undefined
          }
        />
      </div>
    </TooltipProvider>
  );
}

export type { DiscussionWorkspaceProps } from "./view-model";
