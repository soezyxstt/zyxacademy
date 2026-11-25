"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { DiscussionWorkspaceProps } from "@/components/discussions/view-model";
import type { DiscussionWorkspaceController } from "@/features/discussions/model/use-discussion-workspace";
import {
  DiscussionListPane,
  DiscussionThreadOrComposePane,
  useDiscussionMessageScroll,
} from "@/features/discussions/ui/shared/discussion-workspace-parts";

export function DiscussionWorkspaceDesktop({
  props,
  controller,
}: {
  props: DiscussionWorkspaceProps;
  controller: DiscussionWorkspaceController;
}) {
  const t = useTranslations("discussions");
  const frameRef = useRef<HTMLDivElement | null>(null);

  useDiscussionMessageScroll(
    frameRef,
    controller.activeTab,
    props.selectedQuestionId,
    props.selectedMessageId,
    props.messages
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let shift = 0;
    const measure = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const appPage = frame.closest<HTMLElement>("[data-discussion-page]");
      const padBottom = appPage
        ? parseFloat(window.getComputedStyle(appPage).paddingBottom) || 0
        : 12;
      const naturalTop = frame.getBoundingClientRect().top - shift;
      const viewportTop = viewport?.offsetTop ?? 0;
      const editing =
        frame.contains(document.activeElement) &&
        document.activeElement?.matches("textarea, input, [contenteditable=true]");
      shift = editing && viewportTop > 0 ? Math.max(0, viewportTop - naturalTop) : 0;
      frame.style.top = shift ? `${shift}px` : "";
      const height = `${Math.max(0, Math.floor(bottom - Math.max(viewportTop, naturalTop + shift) - padBottom))}px`;
      if (frame.style.height !== height) frame.style.height = height;
      if (frame.style.maxHeight !== height) frame.style.maxHeight = height;
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const parent = frame.closest("[data-discussion-workspace]")?.parentElement;
    if (parent) observer?.observe(parent);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      frame.style.top = "";
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [controller.activeTab, controller.canReport]);

  const showDetail = Boolean(props.selectedQuestionId || controller.composeActive);

  return (
    <div
      ref={frameRef}
      data-discussion-frame=""
      data-discussion-layout="desktop"
      className="relative flex h-[calc(100dvh-9rem)] min-h-0 min-w-0 overflow-hidden"
    >
      <aside
        aria-label={t("questionList")}
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex @min-[52rem]/discussions:w-[21rem] @min-[52rem]/discussions:flex-none @min-[52rem]/discussions:border-r @min-[52rem]/discussions:border-border",
          showDetail ? "hidden" : "flex"
        )}
      >
        <DiscussionListPane
          props={props}
          controller={controller}
          toolbarClassName="@min-[52rem]/discussions:pr-3"
        />
      </aside>
      <section
        aria-label={t("threadContent")}
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex",
          showDetail ? "flex" : "hidden"
        )}
      >
        <DiscussionThreadOrComposePane
          props={props}
          controller={controller}
          showBackButton={false}
          messagesPaddingClassName="p-3 @min-[52rem]/discussions:p-5"
        />
      </section>
    </div>
  );
}
