"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { ArrowLeft, Bell, BellOff, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, LockKeyhole, MessageSquareText, RotateCcw, SquarePen } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUrlTab } from "@/hooks/use-url-tab";
import { normalizeDate } from "@/lib/date-utils";
import { peekRestoredCameraPayload, ZYX_CAMERA_RESTORED_EVENT } from "@/lib/native/camera-recovery";
import { cn } from "@/lib/utils";
import { DiscussionComposer, emptyComposerDraft, setComposerReplyTarget, type ComposerDraft } from "./composer";
import { DiscussionChannelPicker, DiscussionMessage, discussionChannelLabel } from "./discussion-message";
import { DiscussionProfileDialog } from "./discussion-profile-dialog";
import { DiscussionReports } from "./discussion-reports";
import { DiscussionQuestionListSkeleton, DiscussionThreadSkeleton } from "./discussion-skeleton";
import type { DiscussionChannel, DiscussionForwardDraft, DiscussionMessage as Message, DiscussionPerson, DiscussionWorkspaceProps } from "./view-model";


function ChannelName({ channel }: { channel: DiscussionChannel }) {
  const t = useTranslations("discussions");
  return <span data-discussion-channel-label className="inline-flex min-w-0 max-w-full items-start gap-1">{channel.kind === "private" && <LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden />}<span className="min-w-0 [overflow-wrap:anywhere]">{discussionChannelLabel(channel, t)}</span></span>;
}

export function discussionPrivacyKey(channel: DiscussionChannel & { kind: "private" }, role: DiscussionWorkspaceProps["viewer"]["role"]) {
  const requester = channel.isRequester ?? role === "student";
  return channel.privateKind === "academic" ? channel.courseId ? requester ? "privacyAcademicCourse" : "privacyAcademicCourseStaff"
    : requester ? "privacyAcademicAll" : "privacyAcademicAllStaff" : requester ? "privacyAdmin" : "privacyAdminStaff";
}

export function discussionAudienceKey(channel: DiscussionChannel, role: DiscussionWorkspaceProps["viewer"]["role"]) {
  return channel.kind === "private" ? discussionPrivacyKey(channel, role) : channel.kind === "global" ? "privacyGlobal" : "privacyCourse";
}

function LoadMore({ onLoad, label }: { onLoad: () => Promise<void>; label: string }) {
  const t = useTranslations("discussions");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load() {
    setPending(true);
    try { await onLoad(); setFailed(false); } catch { setFailed(true); } finally { setPending(false); }
  }
  return <div className="p-3 text-center"><Button type="button" variant="outline" size="sm" isLoading={pending} onClick={() => void load()}>{failed ? t("retry") : label}</Button>{failed && <p role="alert" className="mt-1 text-body-xs text-destructive">{t("loadError")}</p>}</div>;
}

type State<T> = [T, Dispatch<SetStateAction<T>>];
export type DiscussionDraftState = {
  drafts: State<Record<string, ComposerDraft>>;
  forwardDrafts: State<Record<string, DiscussionForwardDraft>>;
  newOpen: State<boolean>;
  newChannel: State<DiscussionChannel | null>;
};

function calendarDayKey(date: Date, useUtc: boolean) {
  return useUtc
    ? `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayDivider(date: Date, mounted: boolean, locale: string, labels: { today: string; yesterday: string }) {
  const resolvedLocale = locale === "id" ? "id-ID" : "en-US";
  if (!mounted) {
    return date.toLocaleDateString(resolvedLocale, { day: "numeric", month: "short", timeZone: "UTC" });
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

export function DiscussionWorkspace(props: DiscussionWorkspaceProps & { draftState?: DiscussionDraftState }) {
  const t = useTranslations("discussions");
  const { locale } = useAppLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchVisible = searchExpanded || !!props.search;
  const [urlTab, setUrlTab] = useUrlTab("discussionTab", "questions");
  const localDrafts = useState<Record<string, ComposerDraft>>({});
  const [drafts, setDrafts] = props.draftState?.drafts ?? localDrafts;
  const localForwardDrafts = useState<Record<string, DiscussionForwardDraft>>({});
  const [forwardDrafts, setForwardDrafts] = props.draftState?.forwardDrafts ?? localForwardDrafts;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const localNewOpen = useState(false);
  const localNewChannel = useState<DiscussionChannel | null>(null);
  const [newOpen, setNewOpen] = props.draftState?.newOpen ?? localNewOpen;
  const [newChannel, setNewChannel] = props.draftState?.newChannel ?? localNewChannel;
  const [mutePending, setMutePending] = useState(false);
  const [muteError, setMuteError] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [profileTarget, setProfileTarget] = useState<{ author: DiscussionPerson; questionId: string } | null>(null);
  const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null);
  const focusedTarget = useRef<string | null>(null);
  const prevQuestionId = useRef(props.selectedQuestionId);

  const controlledDrafts = Boolean(props.draftState);
  useEffect(() => () => { if (!controlledDrafts) Object.values(draftsRef.current).forEach((draft) => draft.images.forEach((image) => URL.revokeObjectURL(image.previewUrl))); }, [controlledDrafts]);

  useEffect(() => {
    if (props.selectedQuestionId && props.selectedQuestionId !== prevQuestionId.current) {
      setNewOpen(false);
    }
    prevQuestionId.current = props.selectedQuestionId;
  }, [props.selectedQuestionId, setNewOpen]);

  const { viewer, channels, selectedQuestionId, onSelectQuestion } = props;

  useEffect(() => {
    const restoreComposerIfNeeded = () => {
      const pending = peekRestoredCameraPayload(
        (target) => target.surface === "discussion" && target.viewerId === viewer.id,
      );
      if (!pending || pending.target.surface !== "discussion") return;
      const target = pending.target;
      if (target.mode === "new") {
        const targetChannelId = target.channelId;
        const matched = channels.find((item) => item.id === targetChannelId && item.canCreate);
        if (matched) {
          setNewChannel(matched);
          setNewOpen(true);
        }
      } else if (target.mode === "reply" && selectedQuestionId !== target.questionId) {
        setNewOpen(false);
        onSelectQuestion(target.questionId);
      }
    };

    restoreComposerIfNeeded();
    window.addEventListener(ZYX_CAMERA_RESTORED_EVENT, restoreComposerIfNeeded);
    return () => window.removeEventListener(ZYX_CAMERA_RESTORED_EVENT, restoreComposerIfNeeded);
  }, [channels, onSelectQuestion, selectedQuestionId, viewer.id, setNewChannel, setNewOpen]);

  function updateDraft(key: string, change: (draft: ComposerDraft) => ComposerDraft) {
    setDrafts((current) => ({ ...current, [key]: change(current[key] ?? emptyComposerDraft()) }));
  }
  function updateForwardDraft(key: string, change: (draft: DiscussionForwardDraft | undefined) => DiscussionForwardDraft | undefined) {
    setForwardDrafts((current) => {
      const next = change(current[key]);
      if (next) return { ...current, [key]: next };
      const { [key]: _, ...rest } = current;
      return rest;
    });
  }
  const newDraft = drafts.new ?? emptyComposerDraft();
  const newLocked = newDraft.error === "unknown" || newDraft.error === "replay_unverified";
  const question = props.selectedQuestion?.id === props.selectedQuestionId ? props.selectedQuestion : null;
  const channel = props.channels.find((item) => item.id === question?.channelId);
  const selectedChannel = props.channels.find((item) => item.id === props.selectedChannelId) ?? channel;
  const draftKey = question ? `question:${question.id}` : "none";
  const threadDraft = drafts[draftKey] ?? emptyComposerDraft();
  const threadLocked = threadDraft.error === "unknown" || threadDraft.error === "replay_unverified";
  const canReport = props.viewer.role === "admin" && props.reports !== undefined;
  const activeTab = canReport && (props.activeTab ?? urlTab) === "reports" ? "reports" : "questions";
  const creatableChannels = props.channels.filter((item) => item.canCreate);
  const newChannelId = newChannel?.id ?? "";
  const composeActive = newOpen;
  const loadAuthorProfile = props.onLoadAuthorProfile;
  const profileQuestionId = profileTarget?.questionId;
  const loadProfile = useCallback((authorId: string) => loadAuthorProfile!({ questionId: profileQuestionId!, authorId }), [loadAuthorProfile, profileQuestionId]);

  useEffect(() => {
    const key = props.selectedMessageId && props.selectedQuestionId ? `${props.selectedQuestionId}:${props.selectedMessageId}` : null;
    if (!key || activeTab !== "questions") { focusedTarget.current = null; return; }
    if (!frameElement) return;
    const element = Array.from(frameElement.querySelectorAll<HTMLElement>("[data-message-id]"))
      .find(item => item.dataset.messageId === props.selectedMessageId);
    if (!element) { focusedTarget.current = null; return; }
    if (focusedTarget.current === key) return;
    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
      focusedTarget.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [frameElement, activeTab, props.selectedQuestionId, props.selectedMessageId, props.messages]);

  useEffect(() => {
    const frame = frameElement;
    if (!frame) return;
    let shift = 0;
    const measure = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const appPage = frame.closest<HTMLElement>("[data-discussion-page]");
      const padBottom = appPage ? parseFloat(window.getComputedStyle(appPage).paddingBottom) || 0 : 12;
      const naturalTop = frame.getBoundingClientRect().top - shift;
      const viewportTop = viewport?.offsetTop ?? 0;
      const editing = frame.contains(document.activeElement) && document.activeElement?.matches("textarea, input, [contenteditable=true]");
      shift = editing && viewportTop > 0 ? Math.max(0, viewportTop - naturalTop) : 0;
      frame.style.top = shift ? `${shift}px` : "";
      const height = `${Math.max(0, Math.floor(bottom - Math.max(viewportTop, naturalTop + shift) - padBottom))}px`;
      if (frame.style.height !== height) frame.style.height = height;
      if (frame.style.maxHeight !== height) frame.style.maxHeight = height;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const parent = frame.closest("[data-discussion-workspace]")?.parentElement;
    if (parent) observer?.observe(parent);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => { frame.style.top = ""; observer?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure); };
  }, [frameElement, activeTab, canReport]);

  function changeTab(tab: "questions" | "reports") {
    if (props.onTabChange) props.onTabChange(tab);
    else setUrlTab(tab);
  }

  function openNew() {
    if (!newChannel) {
      const initial = creatableChannels.find((item) => item.id === props.selectedChannelId) ?? creatableChannels[0] ?? null;
      if (initial) setNewChannel(initial);
    }
    if (props.selectedQuestionId) props.onSelectQuestion(null);
    setNewOpen(true);
  }

  function selectQuestion(id: string | null, messageId?: string | null) {
    setNewOpen(false);
    props.onSelectQuestion(id, messageId);
  }

  async function toggleMute() {
    if (!selectedChannel || mutePending) return;
    setMutePending(true);
    setMuteError(false);
    try { await props.onSetChannelMuted({ channelId: selectedChannel.id, muted: !selectedChannel.muted }); } catch { setMuteError(true); } finally { setMutePending(false); }
  }

  async function toggleStatus() {
    if (!question || !props.onSetQuestionStatus || statusPending) return;
    setStatusPending(true);
    setStatusError(false);
    try { await props.onSetQuestionStatus({ questionId: question.id, status: question.status === "resolved" ? "open" : "resolved" }); } catch { setStatusError(true); } finally { setStatusPending(false); }
  }

  function replyTo(message: Message) {
    updateDraft(draftKey, (draft) => setComposerReplyTarget(draft, { id: message.id, authorName: message.author.name, excerpt: message.body, imageOnly: !message.body }));
  }

  function questionRow(item: DiscussionWorkspaceProps["questions"][number]) {
    const itemChannel = props.channels.find(value => value.id === item.channelId);
    const status = t(item.status === "open" ? "status_open" : item.status === "answered" ? "status_answered" : "status_resolved");
    return <button type="button" key={item.id} data-question-status={item.status} aria-current={item.id === props.selectedQuestionId && !composeActive ? "true" : undefined} onClick={() => selectQuestion(item.id)} className={cn("w-full min-w-0 space-y-2 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none", item.id === props.selectedQuestionId && !composeActive && "bg-primary/8")}><span className="flex items-start justify-between gap-2"><span className={cn("line-clamp-2 min-w-0 break-words font-heading text-body-sm font-semibold", item.status !== "open" && "text-muted-foreground")}>{item.title}<span className="sr-only">, {status}</span></span>{item.unreadCount > 0 && <span aria-label={t("unreadMessages", { count: item.unreadCount })} className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground">{item.unreadCount}</span>}</span><span data-question-metadata className="flex items-start justify-between gap-2 text-body-xs text-muted-foreground"><span className="min-w-0 flex-1">{itemChannel && <ChannelName channel={itemChannel} />}</span><span className="flex shrink-0 items-center gap-2"><span className="inline-flex items-center gap-1"><MessageSquareText aria-hidden className="size-3" /><span aria-hidden>{item.answerCount}</span><span className="sr-only">{t("answers", { count: item.answerCount })}</span></span><FormattedDate date={item.lastActivityAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} /></span></span></button>;
  }

  const threadBack = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" aria-label={t("backToQuestions")} className="shrink-0 @min-[52rem]/discussions:hidden" onClick={() => selectQuestion(null)}>
          <ArrowLeft aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("backToQuestions")}</TooltipContent>
    </Tooltip>
  );

  return <TooltipProvider><div className="@container/discussions min-w-0" data-discussion-workspace>
    {props.readError && <div role="alert" className="mb-3 flex items-center gap-2 text-body-xs">{t("readError")}<Button type="button" variant="outline" size="sm" onClick={props.onRetryRead}>{t("retry")}</Button></div>}
    <Tabs value={activeTab} onValueChange={(tab) => changeTab(tab as "questions" | "reports")}>
      {canReport && <TabsList className="mb-2"><TabsTrigger value="questions">{t("questions")}</TabsTrigger><TabsTrigger value="reports">{t("reports")}{props.reports!.some((report) => report.status === "pending") && <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-body-xs text-primary">{props.reports!.filter((report) => report.status === "pending").length}</span>}</TabsTrigger></TabsList>}
      <TabsContent value="questions" className="mt-0">
        <div ref={setFrameElement} data-discussion-frame className="relative flex h-[calc(100dvh-9rem)] min-h-0 min-w-0 overflow-hidden">
          <aside aria-label={t("questionList")} className={cn("min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex @min-[52rem]/discussions:w-[21rem] @min-[52rem]/discussions:flex-none @min-[52rem]/discussions:border-r @min-[52rem]/discussions:border-border", props.selectedQuestionId || composeActive ? "hidden" : "flex")}>
            <header data-discussion-list-toolbar="" className="shrink-0 border-b border-border py-1.5 @min-[52rem]/discussions:pr-3">
              <div className="flex min-w-0 items-center gap-1.5">
                {!searchVisible && <div className="min-w-0 flex-1 animate-in fade-in duration-150 motion-reduce:animate-none">
                  {props.channelFilterLocked && selectedChannel
                    ? <span className="block break-words px-2 text-body-sm"><ChannelName channel={selectedChannel} /></span>
                    : <DiscussionChannelPicker value={props.channels.find((item) => item.id === props.selectedChannelId) ?? null} label={t("filterChannel")} placeholder={t("allChannels")} allowAll onSearch={props.onSearchChannels} onChange={(next) => { setNewOpen(false); props.onSelectChannel(next); }} />}
                </div>}
                {!searchVisible && selectedChannel && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={mutePending} aria-label={t(selectedChannel.muted ? "unmuteChannel" : "muteChannel", { name: discussionChannelLabel(selectedChannel, t) })} onClick={() => void toggleMute()}>{selectedChannel.muted ? <BellOff /> : <Bell />}</Button></TooltipTrigger><TooltipContent>{t(selectedChannel.muted ? "unmute" : "mute")}</TooltipContent></Tooltip>}
                <SearchBar
                  size="sm"
                  variant="muted"
                  value={props.search}
                  onSearch={props.onSearchChange}
                  onClear={() => props.onSearchChange("")}
                  expanded={searchExpanded}
                  onExpandedChange={setSearchExpanded}
                  aria-label={t("searchQuestion")}
                  placeholder={t("search")}
                  containerClassName="flex-1 min-w-0"
                />
                {!searchVisible && <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" aria-label={t("newQuestion")} onClick={openNew} disabled={!creatableChannels.length}><SquarePen /></Button></TooltipTrigger><TooltipContent>{t("newQuestion")}</TooltipContent></Tooltip>}
              </div>
              {muteError && <p role="alert" className="mt-2 text-body-xs text-destructive">{t("muteError")}</p>}
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {props.listState === "loading" ? <DiscussionQuestionListSkeleton label={t("loadingQuestions")} /> : props.listState === "error" ? <AdminEmptyState icon={CircleHelp} title={t("questionsError")} className="min-h-full flex-1" action={<Button type="button" variant="outline" onClick={props.onRetryQuestions}>{t("retry")}</Button>} /> : <>
                {props.questions.length === 0 ? <AdminEmptyState icon={MessageSquareText} title={t("noQuestions")} className="min-h-full flex-1" action={creatableChannels.length ? <Button type="button" onClick={openNew}>{t("createQuestion")}</Button> : undefined} /> : <div className="divide-y divide-border">{props.questions.map(item => questionRow(item))}</div>}
                {props.hasMoreQuestions && props.onLoadMoreQuestions && <LoadMore onLoad={props.onLoadMoreQuestions} label={t("loadQuestions")} />}
              </>}
            </div>
            {props.listState !== "loading" && props.listState !== "error" && (
              <Collapsible open={!!props.resolvedOpen} onOpenChange={(open) => props.onResolvedOpenChange?.(open)} data-discussion-resolved className={cn("flex shrink-0 flex-col border-t border-border", props.resolvedOpen && "max-h-[50%] min-h-0")}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="group w-full shrink-0 justify-start px-3 [&>span]:justify-between">
                    {t("status_resolved")}
                    <ChevronDown className="size-4 shrink-0 transition-transform duration-200 -rotate-90 group-data-[state=open]:rotate-0 motion-reduce:transition-none" aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="min-h-0 flex-1 overflow-y-auto border-t border-border">
                  {props.resolvedState === "loading" ? <DiscussionQuestionListSkeleton count={3} label={t("loadingQuestions")} /> : props.resolvedState === "error" ? <div role="alert" className="p-3 text-body-xs"><span>{t("questionsError")}</span> <Button type="button" variant="outline" size="sm" onClick={props.onRetryResolved}>{t("retry")}</Button></div> : <>
                    {(props.resolvedQuestions ?? []).length ? <div className="divide-y divide-border">{props.resolvedQuestions!.map(item => questionRow(item))}</div> : <p className="p-3 text-body-xs text-muted-foreground">{t("noResolvedQuestions")}</p>}
                    {!!(props.resolvedPageIndex || props.resolvedHasMore) && (
                      <div className="flex items-center justify-center gap-2 border-t border-border p-2">
                        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-lg" aria-label={t("previousQuestions")} disabled={!props.resolvedPageIndex} onClick={() => props.onResolvedPage?.("previous")}><ChevronLeft aria-hidden /></Button></TooltipTrigger><TooltipContent>{t("previousQuestions")}</TooltipContent></Tooltip>
                        <span className="text-body-xs tabular-nums">{t("page", { page: (props.resolvedPageIndex ?? 0) + 1 })}</span>
                        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-lg" aria-label={t("loadQuestions")} disabled={!props.resolvedHasMore} onClick={() => props.onResolvedPage?.("next")}><ChevronRight aria-hidden /></Button></TooltipTrigger><TooltipContent>{t("loadQuestions")}</TooltipContent></Tooltip>
                      </div>
                    )}
                  </>}
                </CollapsibleContent>
              </Collapsible>
            )}
          </aside>
          <section aria-label={t("threadContent")} className={cn("min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex", props.selectedQuestionId || composeActive ? "flex" : "hidden")}>{composeActive ? <>
            <div data-discussion-new-question className="shrink-0 border-b border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("backToQuestions")} onClick={() => setNewOpen(false)}><ArrowLeft /></Button>
                <h2 className="font-heading text-body-base font-bold">{t("newQuestion")}</h2>
                <div className="ml-auto min-w-[10rem] max-w-full sm:w-56">
                  <DiscussionChannelPicker
                    value={newChannel}
                    label={t("channel")}
                    placeholder={t("chooseChannel")}
                    onSearch={props.onSearchChannels}
                    onChange={(next) => { setNewChannel(next); updateDraft("new", (draft) => ({ ...draft, requestId: undefined })); }}
                    disabled={newDraft.sending || newLocked || newDraft.images.length > 0}
                  />
                </div>
              </div>
              {newDraft.images.length > 0 && <p className="mt-1.5 text-body-xs text-muted-foreground">{t("removeImagesToChangeChannel")}</p>}
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <DiscussionComposer
                draft={newDraft}
                update={(change) => updateDraft("new", change)}
                channelId={newChannelId}
                audienceHelp={props.composerAudience ?? (newChannel ? t(discussionAudienceKey(newChannel, props.viewer.role)) : undefined)}
                canAskZyra={props.canAskZyra}
                zyraUnscoped={newChannel ? !newChannel.courseId && newChannel.kind !== "course" : undefined}
                viewer={props.viewer}
                onSearchMentions={props.onSearchMentions}
                onUpload={props.onUploadImage}
                disabled={!newChannel}
                onSubmit={({ viewerId: _viewerId, channelId, questionId: _questionId, questionDetails: _details, ...input }) => props.onCreateQuestion({ ...input, channelId })}
                onSuccess={() => { setNewOpen(false); setNewChannel(null); }}
                submitLabel={t("sendQuestion")}
              />
            </div>
          </> : !props.selectedQuestionId ? <AdminEmptyState icon={MessageSquareText} title={t("selectQuestion")} className="min-h-full flex-1" /> : props.threadState === "loading" ? <DiscussionThreadSkeleton label={t("loadingThread")} backButton={threadBack} /> : props.threadState === "error" || !question || !channel ? <div className="flex min-h-0 flex-1 flex-col"><div className="px-3 pt-3 @min-[52rem]/discussions:hidden">{threadBack}</div><AdminEmptyState icon={CircleHelp} title={t("threadError")} className="min-h-full flex-1" action={<Button type="button" variant="outline" onClick={props.onRetryMessages}>{t("retry")}</Button>} /></div> : <>
            <div className="shrink-0 border-b border-border p-3"><div className="flex items-start gap-2">{threadBack}<div className="min-w-0 flex-1"><h2 data-discussion-status aria-describedby="discussion-thread-status" className="break-words font-heading text-body-base font-bold">{question.title}</h2><span id="discussion-thread-status" className="sr-only">{t(question.status === "open" ? "status_open" : question.status === "answered" ? "status_answered" : "status_resolved")}</span><div className="mt-1 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground"><ChannelName channel={channel} /></div></div>{question.canResolve && props.onSetQuestionStatus && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t(question.status === "resolved" ? "reopen" : "resolve")} className="size-8 px-0 @min-[32rem]/discussions:w-auto @min-[32rem]/discussions:px-3" isLoading={statusPending} onClick={() => void toggleStatus()}>{question.status === "resolved" ? <RotateCcw /> : <CheckCircle2 />}<span className="hidden @min-[32rem]/discussions:inline">{t(question.status === "resolved" ? "reopen" : "resolve")}</span></Button></TooltipTrigger><TooltipContent>{t(question.status === "resolved" ? "reopen" : "resolve")}</TooltipContent></Tooltip>}</div>{statusError && <p role="alert" className="mt-1 text-body-xs text-destructive">{t("statusError")}</p>}</div>
            <div data-discussion-messages className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-3 @min-[52rem]/discussions:p-5">{props.hasMoreMessages && props.onLoadMoreMessages && <LoadMore onLoad={props.onLoadMoreMessages} label={t("loadMessages")} />}{props.messages.length ? (() => {
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
                      <div data-discussion-date-divider className="flex justify-center py-1" role="separator">
                        <span suppressHydrationWarning className="rounded-full bg-muted px-3 py-0.5 text-body-xs font-medium text-muted-foreground">
                          {formatDayDivider(messageDate, mounted, locale, { today: t("dateToday"), yesterday: t("dateYesterday") })}
                        </span>
                      </div>
                    )}
                    <DiscussionMessage message={message} questionId={question.id} viewer={props.viewer} sourceChannel={channel} channels={props.channels} forwardDraft={forwardDrafts[message.id]} updateForwardDraft={(change) => updateForwardDraft(message.id, change)} onSearchChannels={props.onSearchChannels} onSearchForwardTargets={props.onSearchForwardTargets} canReply={question.canReply} targeted={message.id === props.selectedMessageId} replyDisabled={threadDraft.sending || threadLocked} onReply={replyTo} onEdit={props.onEditMessage} onDelete={props.onDeleteMessage} onReact={props.onToggleReaction} onForward={props.onForwardMessage} onReport={props.onReportMessage} onViewProfile={(author) => setProfileTarget({ author, questionId: question.id })} renderAttachment={process.env.NODE_ENV === "development" ? props.renderAttachment : undefined} />
                  </Fragment>
                );
              });
            })() : <AdminEmptyState icon={MessageSquareText} title={t("noMessages")} className="min-h-full flex-1" />}</div>
            {(question.canReply || threadDraft.sending || threadDraft.body.length > 0 || threadDraft.images.length > 0 || threadDraft.replyTo) && <div className="flex max-h-[80%] min-h-0 shrink-0 flex-col border-t border-border p-3"><DiscussionComposer draft={question.canReply || threadLocked ? threadDraft : { ...threadDraft, error: "resolved" }} update={(change) => updateDraft(draftKey, change)} channelId={channel.id} audienceHelp={props.composerAudience ?? t(discussionAudienceKey(channel, props.viewer.role))} canAskZyra={props.canAskZyra} zyraUnscoped={!channel.courseId && channel.kind !== "course"} questionId={question.id} viewer={props.viewer} onSearchMentions={props.onSearchMentions} onUpload={props.onUploadImage} onSubmit={({ viewerId: _viewerId, channelId: _channelId, questionId, questionDetails: _details, replyToMessageId, ...input }) => props.onSendReply({ ...input, questionId: questionId!, messageType: replyToMessageId ? "reply" : "answer", replyToMessageId })} submitDisabled={!question.canReply && !threadLocked} submitLabel={t(threadDraft.replyTo ? "sendReply" : "sendAnswer")} /></div>}
          </>}</section>
        </div>
      </TabsContent>
      {canReport && <TabsContent value="reports"><DiscussionReports state={props.reportState} onRetry={props.onRetryReports} reports={props.reports!} onSetStatus={props.onSetReportStatus} onOpenQuestion={(id, messageId) => { if (!props.onTabChange) setUrlTab("questions"); selectQuestion(id, messageId); }} /></TabsContent>}
    </Tabs>
    <DiscussionProfileDialog
      open={!!profileTarget}
      onOpenChange={(open) => { if (!open) setProfileTarget(null); }}
      author={profileTarget?.author ?? null}
      loadProfile={loadAuthorProfile && profileQuestionId ? loadProfile : undefined}
    />
  </div></TooltipProvider>;
}

export type { DiscussionWorkspaceProps } from "./view-model";
