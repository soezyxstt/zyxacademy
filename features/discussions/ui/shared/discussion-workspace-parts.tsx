"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  SquarePen,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareLinkButton } from "@/components/share-link-button";
import { normalizeDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { DiscussionComposer } from "@/components/discussions/composer";
import {
  DiscussionChannelPicker,
  DiscussionMessage,
  discussionChannelLabel,
} from "@/components/discussions/discussion-message";
import {
  DiscussionQuestionListSkeleton,
  DiscussionThreadSkeleton,
} from "@/components/discussions/discussion-skeleton";
import type {
  DiscussionChannel,
  DiscussionWorkspaceProps,
} from "@/components/discussions/view-model";
import {
  discussionAudienceKey,
  type DiscussionWorkspaceController,
} from "@/features/discussions/model/use-discussion-workspace";

export function ChannelName({ channel }: { channel: DiscussionChannel }) {
  const t = useTranslations("discussions");
  return (
    <span
      data-discussion-channel-label
      className="inline-flex min-w-0 max-w-full items-start gap-1"
    >
      {channel.kind === "private" && (
        <LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {discussionChannelLabel(channel, t)}
      </span>
    </span>
  );
}

export function LoadMore({
  onLoad,
  label,
}: {
  onLoad: () => Promise<void>;
  label: string;
}) {
  const t = useTranslations("discussions");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setPending(true);
    try {
      await onLoad();
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-3 text-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={pending}
        onClick={() => void load()}
      >
        {failed ? t("retry") : label}
      </Button>
      {failed && (
        <p role="alert" className="mt-1 text-body-xs text-destructive">
          {t("loadError")}
        </p>
      )}
    </div>
  );
}

function calendarDayKey(date: Date, useUtc: boolean) {
  return useUtc
    ? `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayDivider(
  date: Date,
  mounted: boolean,
  locale: string,
  labels: { today: string; yesterday: string }
) {
  const resolvedLocale = locale === "id" ? "id-ID" : "en-US";
  if (!mounted) {
    return date.toLocaleDateString(resolvedLocale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  const now = new Date();
  const todayKey = calendarDayKey(now, false);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = calendarDayKey(yesterday, false);
  const key = calendarDayKey(date, false);
  if (key === todayKey) return labels.today;
  if (key === yesterdayKey) return labels.yesterday;
  return date.toLocaleDateString(resolvedLocale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function useDiscussionMessageScroll(
  containerRef: { current: HTMLElement | null },
  activeTab: "questions" | "reports",
  selectedQuestionId: string | null | undefined,
  selectedMessageId: string | null | undefined,
  messages: DiscussionWorkspaceProps["messages"]
) {
  const focusedTarget = useRef<string | null>(null);

  useEffect(() => {
    const key =
      selectedMessageId && selectedQuestionId
        ? `${selectedQuestionId}:${selectedMessageId}`
        : null;
    if (!key || activeTab !== "questions") {
      focusedTarget.current = null;
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const element = Array.from(
      container.querySelectorAll<HTMLElement>("[data-message-id]")
    ).find((item) => item.dataset.messageId === selectedMessageId);
    if (!element) {
      focusedTarget.current = null;
      return;
    }
    if (focusedTarget.current === key) return;
    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
      focusedTarget.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, activeTab, selectedQuestionId, selectedMessageId, messages]);
}

export function DiscussionQuestionRow({
  item,
  props,
  controller,
}: {
  item: DiscussionWorkspaceProps["questions"][number];
  props: DiscussionWorkspaceProps;
  controller: DiscussionWorkspaceController;
}) {
  const t = useTranslations("discussions");
  const itemChannel = props.channels.find((value) => value.id === item.channelId);
  const status = t(
    item.status === "open"
      ? "status_open"
      : item.status === "answered"
        ? "status_answered"
        : "status_resolved"
  );
  const isCurrent = item.id === props.selectedQuestionId && !controller.composeActive;

  return (
    <button
      type="button"
      data-question-status={item.status}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => controller.selectQuestion(item.id)}
      className={cn(
        "w-full min-w-0 space-y-2 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none",
        isCurrent && "bg-primary/8"
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "line-clamp-2 min-w-0 break-words font-heading text-body-sm font-semibold",
            item.status !== "open" && "text-muted-foreground"
          )}
        >
          {item.title}
          <span className="sr-only">, {status}</span>
        </span>
        {item.unreadCount > 0 && (
          <span
            aria-label={t("unreadMessages", { count: item.unreadCount })}
            className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground"
          >
            {item.unreadCount}
          </span>
        )}
      </span>
      <span
        data-question-metadata
        className="flex items-start justify-between gap-2 text-body-xs text-muted-foreground"
      >
        <span className="min-w-0 flex-1">
          {itemChannel && <ChannelName channel={itemChannel} />}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <MessageSquareText aria-hidden className="size-3" />
            <span aria-hidden>{item.answerCount}</span>
            <span className="sr-only">{t("answers", { count: item.answerCount })}</span>
          </span>
          <FormattedDate
            date={item.lastActivityAt}
            options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }}
          />
        </span>
      </span>
    </button>
  );
}

export function DiscussionListPane({
  props,
  controller,
  toolbarClassName,
  showToolbar = true,
  listClassName,
  renderQuestionRow,
}: {
  props: DiscussionWorkspaceProps;
  controller: DiscussionWorkspaceController;
  toolbarClassName?: string;
  showToolbar?: boolean;
  listClassName?: string;
  renderQuestionRow?: (
    item: DiscussionWorkspaceProps["questions"][number],
    row: ReactNode
  ) => ReactNode;
}) {
  const t = useTranslations("discussions");
  const { searchVisible, selectedChannel, mutePending, muteError, creatableChannels } =
    controller;

  return (
    <>
      {showToolbar ? (
        <header
          data-discussion-list-toolbar=""
          className={cn("shrink-0 border-b border-border py-1.5", toolbarClassName)}
        >
        <div className="flex min-w-0 items-center gap-1.5">
          {!searchVisible && (
            <div className="min-w-0 flex-1 animate-in fade-in duration-150 motion-reduce:animate-none">
              {props.channelFilterLocked && selectedChannel ? (
                <span className="block break-words px-2 text-body-sm">
                  <ChannelName channel={selectedChannel} />
                </span>
              ) : (
                <DiscussionChannelPicker
                  value={
                    props.channels.find((item) => item.id === props.selectedChannelId) ??
                    null
                  }
                  label={t("filterChannel")}
                  placeholder={t("allChannels")}
                  allowAll
                  onSearch={props.onSearchChannels}
                  onChange={(next) => {
                    controller.setNewOpen(false);
                    props.onSelectChannel(next);
                  }}
                />
              )}
            </div>
          )}
          {!searchVisible && selectedChannel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={mutePending}
                  aria-label={t(
                    selectedChannel.muted ? "unmuteChannel" : "muteChannel",
                    { name: discussionChannelLabel(selectedChannel, t) }
                  )}
                  onClick={() => void controller.toggleMute()}
                >
                  {selectedChannel.muted ? <BellOff /> : <Bell />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t(selectedChannel.muted ? "unmute" : "mute")}
              </TooltipContent>
            </Tooltip>
          )}
          <SearchBar
            size="sm"
            variant="muted"
            value={props.search}
            onSearch={props.onSearchChange}
            onClear={() => props.onSearchChange("")}
            expanded={controller.searchExpanded}
            onExpandedChange={controller.setSearchExpanded}
            aria-label={t("searchQuestion")}
            placeholder={t("search")}
            containerClassName="flex-1 min-w-0"
          />
          {!searchVisible && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  aria-label={t("newQuestion")}
                  onClick={controller.openNew}
                  disabled={!creatableChannels.length}
                >
                  <SquarePen />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("newQuestion")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {muteError && (
          <p role="alert" className="mt-2 text-body-xs text-destructive">
            {t("muteError")}
          </p>
        )}
        </header>
      ) : null}
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", listClassName)}>
        {props.listState === "loading" ? (
          <DiscussionQuestionListSkeleton label={t("loadingQuestions")} />
        ) : props.listState === "error" ? (
          <AdminEmptyState
            icon={CircleHelp}
            title={t("questionsError")}
            className="min-h-full flex-1"
            action={
              <Button type="button" variant="outline" onClick={props.onRetryQuestions}>
                {t("retry")}
              </Button>
            }
          />
        ) : (
          <>
            {props.questions.length === 0 ? (
              <AdminEmptyState
                icon={MessageSquareText}
                title={t("noQuestions")}
                className="min-h-full flex-1"
                action={
                  creatableChannels.length ? (
                    <Button type="button" onClick={controller.openNew}>
                      {t("createQuestion")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {props.questions.map((item) => {
                  const row = (
                    <DiscussionQuestionRow
                      item={item}
                      props={props}
                      controller={controller}
                    />
                  );
                  return (
                    <Fragment key={item.id}>
                      {renderQuestionRow ? renderQuestionRow(item, row) : row}
                    </Fragment>
                  );
                })}
              </div>
            )}
            {props.hasMoreQuestions && props.onLoadMoreQuestions && (
              <LoadMore onLoad={props.onLoadMoreQuestions} label={t("loadQuestions")} />
            )}
          </>
        )}
      </div>
      {props.listState !== "loading" && props.listState !== "error" && (
        <Collapsible
          open={!!props.resolvedOpen}
          onOpenChange={(open) => props.onResolvedOpenChange?.(open)}
          data-discussion-resolved
          className={cn(
            "flex shrink-0 flex-col border-t border-border",
            props.resolvedOpen && "max-h-[50%] min-h-0"
          )}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group w-full shrink-0 justify-start px-3 [&>span]:justify-between"
            >
              {t("status_resolved")}
              <ChevronDown
                className="size-4 shrink-0 -rotate-90 transition-transform duration-200 group-data-[state=open]:rotate-0 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {props.resolvedState === "loading" ? (
              <DiscussionQuestionListSkeleton count={3} label={t("loadingQuestions")} />
            ) : props.resolvedState === "error" ? (
              <div role="alert" className="p-3 text-body-xs">
                <span>{t("questionsError")}</span>{" "}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={props.onRetryResolved}
                >
                  {t("retry")}
                </Button>
              </div>
            ) : (
              <>
                {(props.resolvedQuestions ?? []).length ? (
                  <div className="divide-y divide-border">
                    {props.resolvedQuestions!.map((item) => {
                      const row = (
                        <DiscussionQuestionRow
                          item={item}
                          props={props}
                          controller={controller}
                        />
                      );
                      return (
                        <Fragment key={item.id}>
                          {renderQuestionRow ? renderQuestionRow(item, row) : row}
                        </Fragment>
                      );
                    })}
                  </div>
                ) : (
                  <p className="p-3 text-body-xs text-muted-foreground">
                    {t("noResolvedQuestions")}
                  </p>
                )}
                {!!(props.resolvedPageIndex || props.resolvedHasMore) && (
                  <div className="flex items-center justify-center gap-2 border-t border-border p-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={t("previousQuestions")}
                          disabled={!props.resolvedPageIndex}
                          onClick={() => props.onResolvedPage?.("previous")}
                        >
                          <ChevronLeft aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("previousQuestions")}</TooltipContent>
                    </Tooltip>
                    <span className="text-body-xs tabular-nums">
                      {t("page", { page: (props.resolvedPageIndex ?? 0) + 1 })}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={t("loadQuestions")}
                          disabled={!props.resolvedHasMore}
                          onClick={() => props.onResolvedPage?.("next")}
                        >
                          <ChevronRight aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("loadQuestions")}</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

export function DiscussionThreadOrComposePane({
  props,
  controller,
  showBackButton,
  showComposeBackButton = true,
  hideThreadHeader = false,
  messagesPaddingClassName = "p-3",
}: {
  props: DiscussionWorkspaceProps;
  controller: DiscussionWorkspaceController;
  showBackButton: boolean;
  showComposeBackButton?: boolean;
  hideThreadHeader?: boolean;
  messagesPaddingClassName?: string;
}) {
  const t = useTranslations("discussions");
  const { locale } = useAppLocale();
  const {
    composeActive,
    newChannel,
    setNewChannel,
    newChannelId,
    newDraft,
    newLocked,
    question,
    channel,
    draftKey,
    threadDraft,
    threadLocked,
    forwardDrafts,
    statusPending,
    statusError,
    mounted,
  } = controller;

  const threadBack = showBackButton ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={t("backToQuestions")}
          className="shrink-0"
          onClick={() => controller.selectQuestion(null)}
        >
          <ArrowLeft aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("backToQuestions")}</TooltipContent>
    </Tooltip>
  ) : null;

  if (composeActive) {
    return (
      <>
        <div
          data-discussion-new-question
          className="shrink-0 border-b border-border p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {showComposeBackButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("backToQuestions")}
                onClick={() => controller.setNewOpen(false)}
              >
                <ArrowLeft />
              </Button>
            ) : null}
            <h2 className="font-heading text-body-base font-bold">
              {t("newQuestion")}
            </h2>
            <div className="ml-auto min-w-[10rem] max-w-full sm:w-56">
              <DiscussionChannelPicker
                value={newChannel}
                label={t("channel")}
                placeholder={t("chooseChannel")}
                onSearch={props.onSearchChannels}
                onChange={(next) => {
                  setNewChannel(next);
                  controller.updateDraft("new", (draft) => ({
                    ...draft,
                    requestId: undefined,
                  }));
                }}
                disabled={newDraft.sending || newLocked || newDraft.images.length > 0}
              />
            </div>
          </div>
          {newDraft.images.length > 0 && (
            <p className="mt-1.5 text-body-xs text-muted-foreground">
              {t("removeImagesToChangeChannel")}
            </p>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <DiscussionComposer
            draft={newDraft}
            update={(change) => controller.updateDraft("new", change)}
            channelId={newChannelId}
            audienceHelp={
              props.composerAudience ??
              (newChannel
                ? t(discussionAudienceKey(newChannel, props.viewer.role))
                : undefined)
            }
            canAskZyra={props.canAskZyra}
            zyraUnscoped={
              newChannel
                ? !newChannel.courseId && newChannel.kind !== "course"
                : undefined
            }
            viewer={props.viewer}
            onSearchMentions={props.onSearchMentions}
            onUpload={props.onUploadImage}
            disabled={!newChannel}
            onSubmit={({
              viewerId: _viewerId,
              channelId,
              questionId: _questionId,
              questionDetails: _details,
              ...input
            }) => props.onCreateQuestion({ ...input, channelId })}
            onSuccess={() => {
              controller.setNewOpen(false);
              setNewChannel(null);
            }}
            submitLabel={t("sendQuestion")}
          />
        </div>
      </>
    );
  }

  if (!props.selectedQuestionId) {
    return (
      <AdminEmptyState
        icon={MessageSquareText}
        title={t("selectQuestion")}
        className="min-h-full flex-1"
      />
    );
  }

  if (props.threadState === "loading") {
    return (
      <DiscussionThreadSkeleton
        label={t("loadingThread")}
        backButton={threadBack ?? undefined}
      />
    );
  }

  if (props.threadState === "error" || !question || !channel) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {threadBack && <div className="px-3 pt-3">{threadBack}</div>}
        <AdminEmptyState
          icon={CircleHelp}
          title={t("threadError")}
          className="min-h-full flex-1"
          action={
            <Button type="button" variant="outline" onClick={props.onRetryMessages}>
              {t("retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const showReplyComposer =
    question.canReply ||
    threadDraft.sending ||
    threadDraft.body.length > 0 ||
    threadDraft.images.length > 0 ||
    Boolean(threadDraft.replyTo);

  return (
    <>
      {hideThreadHeader ? (
        <>
          <span id="discussion-thread-status" className="sr-only">
            {t(
              question.status === "open"
                ? "status_open"
                : question.status === "answered"
                  ? "status_answered"
                  : "status_resolved"
            )}
          </span>
          {statusError && (
            <p role="alert" className="px-3 pt-2 text-body-xs text-destructive">
              {t("statusError")}
            </p>
          )}
        </>
      ) : (
        <div className="shrink-0 border-b border-border p-3">
          <div className="flex items-start gap-2">
            {threadBack}
            <div className="min-w-0 flex-1">
              <h2
                data-discussion-status
                aria-describedby="discussion-thread-status"
                className="break-words font-heading text-body-base font-bold"
              >
                {question.title}
              </h2>
              <span id="discussion-thread-status" className="sr-only">
                {t(
                  question.status === "open"
                    ? "status_open"
                    : question.status === "answered"
                      ? "status_answered"
                      : "status_resolved"
                )}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
                <ChannelName channel={channel} />
              </div>
            </div>
            <ShareLinkButton
              title={question.title}
              variant="outline"
              size="icon-sm"
              className="size-8 shrink-0"
            />
            {question.canResolve && props.onSetQuestionStatus && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t(question.status === "resolved" ? "reopen" : "resolve")}
                    className="size-8 px-0 @min-[32rem]/discussions:w-auto @min-[32rem]/discussions:px-3"
                    isLoading={statusPending}
                    onClick={() => void controller.toggleStatus()}
                  >
                    {question.status === "resolved" ? <RotateCcw /> : <CheckCircle2 />}
                    <span className="hidden @min-[32rem]/discussions:inline">
                      {t(question.status === "resolved" ? "reopen" : "resolve")}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(question.status === "resolved" ? "reopen" : "resolve")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {statusError && (
            <p role="alert" className="mt-1 text-body-xs text-destructive">
              {t("statusError")}
            </p>
          )}
        </div>
      )}

      <div
        data-discussion-messages
        className={cn(
          "flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto",
          messagesPaddingClassName
        )}
      >
        {props.hasMoreMessages && props.onLoadMoreMessages && (
          <LoadMore onLoad={props.onLoadMoreMessages} label={t("loadMessages")} />
        )}
        {props.messages.length ? (
          (() => {
            let lastDayKey: string | null = null;
            return props.messages.map((message) => {
              const messageDate = normalizeDate(message.createdAt);
              const validDate = !Number.isNaN(messageDate.getTime());
              const dayKey = validDate ? calendarDayKey(messageDate, !mounted) : null;
              const showDivider = Boolean(dayKey && dayKey !== lastDayKey);
              if (dayKey) lastDayKey = dayKey;
              return (
                <Fragment key={message.id}>
                  {showDivider && (
                    <div
                      data-discussion-date-divider
                      className="flex justify-center py-1"
                      role="separator"
                    >
                      <span
                        suppressHydrationWarning
                        className="rounded-md bg-muted px-2.5 py-0.5 text-body-xs font-medium text-muted-foreground"
                      >
                        {formatDayDivider(messageDate, mounted, locale, {
                          today: t("dateToday"),
                          yesterday: t("dateYesterday"),
                        })}
                      </span>
                    </div>
                  )}
                  <DiscussionMessage
                    message={message}
                    questionId={question.id}
                    viewer={props.viewer}
                    sourceChannel={channel}
                    channels={props.channels}
                    forwardDraft={forwardDrafts[message.id]}
                    updateForwardDraft={(change) =>
                      controller.updateForwardDraft(message.id, change)
                    }
                    onSearchChannels={props.onSearchChannels}
                    onSearchForwardTargets={props.onSearchForwardTargets}
                    canReply={question.canReply}
                    targeted={message.id === props.selectedMessageId}
                    replyDisabled={threadDraft.sending || threadLocked}
                    onReply={controller.replyTo}
                    onEdit={props.onEditMessage}
                    onDelete={props.onDeleteMessage}
                    onReact={props.onToggleReaction}
                    onForward={props.onForwardMessage}
                    onReport={props.onReportMessage}
                    onViewProfile={(author) =>
                      controller.setProfileTarget({ author, questionId: question.id })
                    }
                    renderAttachment={
                      process.env.NODE_ENV === "development"
                        ? props.renderAttachment
                        : undefined
                    }
                  />
                </Fragment>
              );
            });
          })()
        ) : (
          <AdminEmptyState
            icon={MessageSquareText}
            title={t("noMessages")}
            className="min-h-full flex-1"
          />
        )}
      </div>

      {showReplyComposer && (
        <div className="flex max-h-[80%] min-h-0 shrink-0 flex-col border-t border-border bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <DiscussionComposer
            draft={
              question.canReply || threadLocked
                ? threadDraft
                : { ...threadDraft, error: "resolved" }
            }
            update={(change) => controller.updateDraft(draftKey, change)}
            channelId={channel.id}
            audienceHelp={
              props.composerAudience ??
              t(discussionAudienceKey(channel, props.viewer.role))
            }
            canAskZyra={props.canAskZyra}
            zyraUnscoped={!channel.courseId && channel.kind !== "course"}
            questionId={question.id}
            viewer={props.viewer}
            onSearchMentions={props.onSearchMentions}
            onUpload={props.onUploadImage}
            onSubmit={({
              viewerId: _viewerId,
              channelId: _channelId,
              questionId,
              questionDetails: _details,
              replyToMessageId,
              ...input
            }) =>
              props.onSendReply({
                ...input,
                questionId: questionId!,
                messageType: replyToMessageId ? "reply" : "answer",
                replyToMessageId,
              })
            }
            submitDisabled={!question.canReply && !threadLocked}
            submitLabel={t(threadDraft.replyTo ? "sendReply" : "sendAnswer")}
          />
        </div>
      )}
    </>
  );
}
