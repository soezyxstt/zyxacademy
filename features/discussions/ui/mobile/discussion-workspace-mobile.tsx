"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { SquarePen } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import {
  MOBILE_TOP_NAV_ICON_BUTTON_CLASS,
  useHideMobileBottomNav,
  useMobileTopNav,
  useMobileTopNavSearch,
} from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ShareLinkButton } from "@/components/share-link-button";
import {
  DiscussionChannelPicker,
  discussionChannelLabel,
} from "@/components/discussions/discussion-message";
import { shareLink } from "@/lib/native/share";
import type { DiscussionWorkspaceProps } from "@/components/discussions/view-model";
import type { DiscussionWorkspaceController } from "@/features/discussions/model/use-discussion-workspace";
import {
  ChannelName,
  DiscussionListPane,
  DiscussionThreadOrComposePane,
  useDiscussionMessageScroll,
} from "@/features/discussions/ui/shared/discussion-workspace-parts";
import { SwipeableDiscussionRow } from "./swipeable-discussion-row";

/**
 * Explicit 1-pane master/detail mobile workspace:
 * - List view: channel selector lives in MobileTopNavbar, MobileBottomNav stays visible,
 *   and a bottom-right FAB opens the new question composer.
 * - Detail view (active thread or new question composer): hides MobileBottomNav
 *   and occupies full viewport height minus the sticky mobile top navbar.
 */
export function DiscussionWorkspaceMobile({
  props,
  controller,
}: {
  props: DiscussionWorkspaceProps;
  controller: DiscussionWorkspaceController;
}) {
  const t = useTranslations("discussions");
  const common = useTranslations("common");
  const isDetailOpen = Boolean(props.selectedQuestionId || controller.composeActive);
  useHideMobileBottomNav(isDetailOpen);

  const selectedChannelValue = useMemo(
    () => props.channels.find((item) => item.id === props.selectedChannelId) ?? null,
    [props.channels, props.selectedChannelId]
  );

  const handleShareQuestion = useCallback(
    (item: DiscussionWorkspaceProps["questions"][number]) => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.set("question", item.id);
      void shareLink({
        title: item.title,
        url: url.toString(),
        dialogTitle: common("share.button"),
      }).then((result) => {
        if (result.ok) {
          if (result.method === "clipboard") {
            toast.success(common("share.linkCopied"));
          }
        } else if (!result.cancelled) {
          toast.error(common("share.failed"));
        }
      });
    },
    [common]
  );

  const mobileTopNavConfig = useMemo(() => {
    if (controller.composeActive) {
      return {
        title: t("newQuestion"),
        onBack: () => controller.setNewOpen(false),
        backLabel: t("backToQuestions"),
      };
    }
    if (props.selectedQuestionId) {
      const courseLabel = controller.channel
        ? discussionChannelLabel(controller.channel, t)
        : undefined;
      return {
        title: controller.question?.title ?? t("title"),
        subtitle: courseLabel,
        onBack: () => controller.selectQuestion(null),
        backLabel: t("backToQuestions"),
        pageActions: controller.question ? (
          <ShareLinkButton
            title={controller.question.title}
            variant="outline"
            size="icon-lg"
            className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
          />
        ) : undefined,
      };
    }
    return {
      title: "",
      leftSlot: (
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          {props.channelFilterLocked && controller.selectedChannel ? (
            <span className="block min-w-0 flex-1 truncate font-heading text-body-sm font-semibold text-foreground">
              <ChannelName channel={controller.selectedChannel} />
            </span>
          ) : (
            <DiscussionChannelPicker
              value={selectedChannelValue}
              label={t("filterChannel")}
              placeholder={t("allChannels")}
              allowAll
              singleLine
              triggerClassName="rounded-xl border border-border/60 bg-card/85 px-2.5 text-foreground shadow-xs backdrop-blur-md hover:bg-muted/70 active:scale-[0.97] transition-all duration-150 motion-reduce:transition-none motion-reduce:active:scale-100"
              onSearch={props.onSearchChannels}
              onChange={(next) => {
                controller.setNewOpen(false);
                props.onSelectChannel(next);
              }}
            />
          )}
        </div>
      ),
    };
  }, [
    controller,
    props,
    selectedChannelValue,
    t,
  ]);
  useMobileTopNav(mobileTopNavConfig);

  useMobileTopNavSearch(
    !isDetailOpen
      ? {
          value: props.search,
          onChange: props.onSearchChange,
          onClear: () => props.onSearchChange(""),
          placeholder: t("searchQuestion"),
          ariaLabel: t("searchQuestion"),
          isLoading:
            props.listState === "loading" && props.search.trim().length > 0,
        }
      : null
  );

  const detailFrameRef = useRef<HTMLDivElement | null>(null);

  useDiscussionMessageScroll(
    detailFrameRef,
    controller.activeTab,
    props.selectedQuestionId,
    props.selectedMessageId,
    props.messages
  );

  useEffect(() => {
    const frame = detailFrameRef.current;
    if (!frame || !isDetailOpen) return;

    const measure = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const top = Math.max(0, frame.getBoundingClientRect().top);
      const available = Math.max(240, Math.floor(viewport.offsetTop + viewport.height - top));
      const height = `${available}px`;
      if (frame.style.height !== height) frame.style.height = height;
      if (frame.style.maxHeight !== height) frame.style.maxHeight = height;
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      frame.style.height = "";
      frame.style.maxHeight = "";
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [isDetailOpen]);

  if (isDetailOpen) {
    return (
      <section
        ref={detailFrameRef}
        aria-label={t("threadContent")}
        data-discussion-frame=""
        data-discussion-layout="mobile-detail"
        className="flex h-[calc(100dvh-var(--mobile-navbar-height,3.25rem))] min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <DiscussionThreadOrComposePane
          props={props}
          controller={controller}
          showBackButton={false}
          showComposeBackButton={false}
          hideThreadHeader
          messagesPaddingClassName="px-3 py-2.5"
        />
      </section>
    );
  }

  return (
    <div
      data-discussion-frame=""
      data-discussion-layout="mobile-list"
      className="flex min-h-[calc(100dvh-var(--mobile-navbar-height,3.25rem)-var(--mobile-bottom-nav-height,3.75rem)-2rem)] min-w-0 flex-col pb-20"
    >
      <DiscussionListPane
        props={props}
        controller={controller}
        showToolbar={false}
        renderQuestionRow={(item, row) => (
          <SwipeableDiscussionRow
            shareLabel={common("share.button")}
            onShare={() => handleShareQuestion(item)}
            canToggleResolve={Boolean(item.canResolve && props.onSetQuestionStatus)}
            isResolved={item.status === "resolved"}
            resolveLabel={t("resolve")}
            reopenLabel={t("reopen")}
            onToggleResolve={
              props.onSetQuestionStatus
                ? () =>
                    void props.onSetQuestionStatus?.({
                      questionId: item.id,
                      status: item.status === "resolved" ? "open" : "resolved",
                    })
                : undefined
            }
          >
            {row}
          </SwipeableDiscussionRow>
        )}
      />
      {controller.creatableChannels.length > 0 ? (
        <Button
          type="button"
          size="icon-lg"
          data-discussion-mobile-fab=""
          aria-label={t("newQuestion")}
          onClick={controller.openNew}
          className="fixed right-4 bottom-[calc(var(--mobile-bottom-nav-height,0px)+1rem)] z-30 size-12 rounded-full shadow-md transition-transform duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 md:hidden"
        >
          <SquarePen className="size-5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
