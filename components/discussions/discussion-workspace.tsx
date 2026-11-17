"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { ArrowLeft, Bell, BellOff, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Loader2, LockKeyhole, MessageSquareText, RotateCcw, Search, SquarePen, X } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import { DiscussionComposer, emptyComposerDraft, setComposerReplyTarget, type ComposerDraft } from "./composer";
import { DiscussionChannelPicker, DiscussionMessage, discussionChannelLabel } from "./discussion-message";
import { DiscussionReports } from "./discussion-reports";
import type { DiscussionChannel, DiscussionForwardDraft, DiscussionMessage as Message, DiscussionPrivateKind, DiscussionWorkspaceProps } from "./view-model";


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
  newTitle: State<string>;
  newChannel: State<DiscussionChannel | null>;
  newHelpKind: State<Exclude<DiscussionPrivateKind, "academic">>;
  newAudience: State<"together" | "academic" | "technical">;
};

export function DiscussionWorkspace(props: DiscussionWorkspaceProps & { draftState?: DiscussionDraftState }) {
  const t = useTranslations("discussions");
  const ui = useTranslations("ui");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchVisible = searchExpanded || !!props.search;
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);
  useEffect(() => {
    if (!searchVisible && restoreSearchFocus.current) {
      searchTrigger.current?.focus();
      restoreSearchFocus.current = false;
    }
  }, [searchVisible]);
  function closeSearch() {
    restoreSearchFocus.current = true;
    props.onSearchChange("");
    setSearchExpanded(false);
  }
  const [urlTab, setUrlTab] = useUrlTab("discussionTab", "questions");
  const localDrafts = useState<Record<string, ComposerDraft>>({});
  const [drafts, setDrafts] = props.draftState?.drafts ?? localDrafts;
  const localForwardDrafts = useState<Record<string, DiscussionForwardDraft>>({});
  const [forwardDrafts, setForwardDrafts] = props.draftState?.forwardDrafts ?? localForwardDrafts;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const localNewOpen = useState(false);
  const localNewTitle = useState("");
  const localNewChannel = useState<DiscussionChannel | null>(null);
  const localNewHelpKind = useState<Exclude<DiscussionPrivateKind, "academic">>("operations");
  const localNewAudience = useState<"together" | "academic" | "technical">("together");
  const [newOpen, setNewOpen] = props.draftState?.newOpen ?? localNewOpen;
  const [newTitle, setNewTitle] = props.draftState?.newTitle ?? localNewTitle;
  const [newChannel, setNewChannel] = props.draftState?.newChannel ?? localNewChannel;
  const [newHelpKind, setNewHelpKind] = props.draftState?.newHelpKind ?? localNewHelpKind;
  const [newAudience, setNewAudience] = props.draftState?.newAudience ?? localNewAudience;
  const [preparingTeam, setPreparingTeam] = useState(false);
  const [teamError, setTeamError] = useState(false);
  const teamPrepareVersion = useRef(0);
  const [mutePending, setMutePending] = useState(false);
  const [muteError, setMuteError] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null);
  const focusedTarget = useRef<string | null>(null);

  const controlledDrafts = Boolean(props.draftState);
  useEffect(() => () => { teamPrepareVersion.current++; if (!controlledDrafts) Object.values(draftsRef.current).forEach((draft) => draft.images.forEach((image) => URL.revokeObjectURL(image.previewUrl))); }, [controlledDrafts]);

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
    const measure = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const height = `${Math.max(320, Math.floor(bottom - Math.max(0, frame.getBoundingClientRect().top)))}px`;
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
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure); };
  }, [frameElement, activeTab, canReport]);

  function changeTab(tab: "questions" | "reports") {
    if (props.onTabChange) props.onTabChange(tab);
    else setUrlTab(tab);
  }

  function openNew() {
    if (!newChannel && (!props.onPrepareTeamChannel || newAudience === "together")) {
      const initial = props.onPrepareTeamChannel ? creatableChannels.find((item) => item.kind === "course") : creatableChannels.find((item) => item.id === props.selectedChannelId) ?? creatableChannels[0];
      setNewChannel(initial ?? null);
      if (initial?.kind === "private" && initial.privateKind !== "academic") setNewHelpKind(initial.privateKind);
    }
    setNewOpen(true);
  }

  async function prepareTeam(team: "academic" | "technical") {
    if (!props.onPrepareTeamChannel) return;
    const version = ++teamPrepareVersion.current;
    setNewChannel(null);
    setPreparingTeam(true);
    setTeamError(false);
    try {
      const prepared = await props.onPrepareTeamChannel(team);
      if (version === teamPrepareVersion.current) setNewChannel(prepared);
    } catch { if (version === teamPrepareVersion.current) setTeamError(true); }
    finally { if (version === teamPrepareVersion.current) setPreparingTeam(false); }
  }

  function changeAudience(value: "together" | "academic" | "technical") {
    if (value === newAudience) return;
    setNewAudience(value);
    setTeamError(false);
    updateDraft("new", (draft) => ({ ...draft, requestId: undefined }));
    if (value === "together") {
      teamPrepareVersion.current++;
      setPreparingTeam(false);
      setNewChannel(creatableChannels.find((item) => item.kind === "course") ?? null);
    } else {
      if (value === "technical") setNewHelpKind("bug");
      void prepareTeam(value);
    }
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
    return <button type="button" key={item.id} data-question-status={item.status} aria-current={item.id === props.selectedQuestionId ? "true" : undefined} onClick={() => props.onSelectQuestion(item.id)} className={cn("w-full min-w-0 space-y-2 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none", item.id === props.selectedQuestionId && "bg-primary/8")}><span className="flex items-start justify-between gap-2"><span className={cn("min-w-0 break-words font-heading text-body-sm font-semibold", item.status !== "open" && "text-muted-foreground")}>{item.title}<span className="sr-only">, {status}</span></span>{item.unreadCount > 0 && <span aria-label={t("unreadMessages", { count: item.unreadCount })} className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground">{item.unreadCount}</span>}</span><span data-question-metadata className="flex items-start justify-between gap-2 text-body-xs text-muted-foreground"><span className="min-w-0 flex-1">{itemChannel && <ChannelName channel={itemChannel} />}</span><span className="flex shrink-0 items-center gap-2"><span className="inline-flex items-center gap-1"><MessageSquareText aria-hidden className="size-3" /><span aria-hidden>{item.answerCount}</span><span className="sr-only">{t("answers", { count: item.answerCount })}</span></span><FormattedDate date={item.lastActivityAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} /></span></span></button>;
  }

  return <TooltipProvider><div className="@container/discussions min-w-0" data-discussion-workspace>
    {props.readError && <div role="alert" className="mb-3 flex items-center gap-2 text-body-xs">{t("readError")}<Button type="button" variant="outline" size="sm" onClick={props.onRetryRead}>{t("retry")}</Button></div>}
    <Tabs value={activeTab} onValueChange={(tab) => changeTab(tab as "questions" | "reports")}>
      {canReport && <TabsList className="mb-3"><TabsTrigger value="questions">{t("questions")}</TabsTrigger><TabsTrigger value="reports">{t("reports")}{props.reports!.some((report) => report.status === "pending") && <span className="ml-1 rounded-md bg-primary/10 px-1.5 text-body-xs text-primary">{props.reports!.filter((report) => report.status === "pending").length}</span>}</TabsTrigger></TabsList>}
      <TabsContent value="questions" className="mt-0">
        <div ref={setFrameElement} className="flex h-[48rem] min-w-0 overflow-hidden rounded-xl border border-border bg-card @min-[52rem]/discussions:h-[44rem]">
          <aside aria-label={t("questionList")} className={cn("min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex @min-[52rem]/discussions:w-[21rem] @min-[52rem]/discussions:flex-none @min-[52rem]/discussions:border-r @min-[52rem]/discussions:border-border", props.selectedQuestionId ? "hidden" : "flex")}>
            <div className="space-y-3 border-b border-border p-3">
              <div className="flex min-w-0 items-center gap-2" onKeyDown={(event) => { if (searchVisible && event.key === "Escape") { event.preventDefault(); closeSearch(); } }}>{searchVisible ? <><Input autoFocus value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} aria-label={t("searchQuestion")} placeholder={t("search")} className="min-w-0 flex-1" /><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={ui("close")} onClick={closeSearch}><X /></Button></TooltipTrigger><TooltipContent>{ui("close")}</TooltipContent></Tooltip></> : <><div className="min-w-0 flex-1"><DiscussionChannelPicker value={props.channels.find((item) => item.id === props.selectedChannelId) ?? null} label={t("filterChannel")} placeholder={t("allChannels")} allowAll onSearch={props.onSearchChannels} onChange={props.onSelectChannel} /></div><Tooltip><TooltipTrigger asChild><Button ref={searchTrigger} type="button" variant="ghost" size="icon-sm" aria-label={t("searchQuestion")} onClick={() => setSearchExpanded(true)}><Search /></Button></TooltipTrigger><TooltipContent>{t("searchQuestion")}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" aria-label={t("newQuestion")} onClick={openNew} disabled={!creatableChannels.length}><SquarePen /></Button></TooltipTrigger><TooltipContent>{t("newQuestion")}</TooltipContent></Tooltip></>}</div>
              {selectedChannel && <div className="flex items-center justify-between gap-2 text-body-xs text-muted-foreground"><span className="min-w-0"><ChannelName channel={selectedChannel} />{selectedChannel.unreadCount > 0 && <span className="ml-2 inline-block">{t("unreadQuestions", { count: selectedChannel.unreadCount })}</span>}</span><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={mutePending} aria-label={t(selectedChannel.muted ? "unmuteChannel" : "muteChannel", { name: discussionChannelLabel(selectedChannel, t) })} onClick={() => void toggleMute()}>{selectedChannel.muted ? <BellOff /> : <Bell />}</Button></TooltipTrigger><TooltipContent>{t(selectedChannel.muted ? "unmute" : "mute")}</TooltipContent></Tooltip></div>}
              {muteError && <p role="alert" className="text-body-xs text-destructive">{t("muteError")}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {props.listState === "loading" ? <div role="status" className="flex items-center gap-2 p-5 text-body-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("loadingQuestions")}</div> : props.listState === "error" ? <AdminEmptyState icon={CircleHelp} title={t("questionsError")} action={<Button type="button" variant="outline" onClick={props.onRetryQuestions}>{t("retry")}</Button>} /> : <>
                {props.questions.length === 0 ? <AdminEmptyState icon={MessageSquareText} title={t("noQuestions")} action={creatableChannels.length ? <Button type="button" onClick={openNew}>{t("createQuestion")}</Button> : undefined} /> : <div className="divide-y divide-border">{props.questions.map(item => questionRow(item))}</div>}
                {props.hasMoreQuestions && props.onLoadMoreQuestions && <LoadMore onLoad={props.onLoadMoreQuestions} label={t("loadQuestions")} />}
                <div className="border-t border-border">
                  <Button type="button" variant="ghost" className="w-full justify-start px-3 [&>span]:justify-between" aria-expanded={!!props.resolvedOpen} onClick={() => props.onResolvedOpenChange?.(!props.resolvedOpen)}>{t("status_resolved")}{props.resolvedOpen ? <ChevronDown /> : <ChevronRight />}</Button>
                  {props.resolvedOpen && (props.resolvedState === "loading" ? <p role="status" className="p-3 text-body-xs text-muted-foreground">{t("loadingQuestions")}</p> : props.resolvedState === "error" ? <div role="alert" className="p-3 text-body-xs"><span>{t("questionsError")}</span> <Button type="button" variant="outline" size="sm" onClick={props.onRetryResolved}>{t("retry")}</Button></div> : <>
                    {(props.resolvedQuestions ?? []).length ? <div className="divide-y divide-border">{props.resolvedQuestions!.map(item => questionRow(item))}</div> : <p className="p-3 text-body-xs text-muted-foreground">{t("noResolvedQuestions")}</p>}
                    {!!(props.resolvedPageIndex || props.resolvedHasMore) && <div className="flex flex-wrap items-center gap-2 p-3"><Button type="button" variant="outline" size="sm" disabled={!props.resolvedPageIndex} onClick={() => props.onResolvedPage?.("previous")}>{t("previousQuestions")}</Button><span className="text-body-xs">{t("page", { page: (props.resolvedPageIndex ?? 0) + 1 })}</span><Button type="button" variant="outline" size="sm" disabled={!props.resolvedHasMore} onClick={() => props.onResolvedPage?.("next")}>{t("loadQuestions")}</Button></div>}
                  </>)}
                </div>
              </>}
            </div>
          </aside>
          <section aria-label={t("threadContent")} className={cn("min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex", props.selectedQuestionId ? "flex" : "hidden")}>{!props.selectedQuestionId ? <AdminEmptyState icon={MessageSquareText} title={t("selectQuestion")} className="h-full" /> : props.threadState === "loading" ? <div className="p-3"><Button type="button" variant="ghost" size="sm" className="@min-[52rem]/discussions:hidden" onClick={() => props.onSelectQuestion(null)}><ArrowLeft /> {t("back")}</Button><div role="status" className="flex items-center gap-2 p-2 text-body-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("loadingThread")}</div></div> : props.threadState === "error" || !question || !channel ? <div><Button type="button" variant="ghost" size="sm" className="m-3 @min-[52rem]/discussions:hidden" onClick={() => props.onSelectQuestion(null)}><ArrowLeft /> {t("back")}</Button><AdminEmptyState icon={CircleHelp} title={t("threadError")} action={<Button type="button" variant="outline" onClick={props.onRetryMessages}>{t("retry")}</Button>} /></div> : <>
            <div className="border-b border-border p-3"><div className="flex items-start gap-2"><Button type="button" variant="ghost" size="icon-sm" aria-label={t("backToQuestions")} className="@min-[52rem]/discussions:hidden" onClick={() => props.onSelectQuestion(null)}><ArrowLeft /></Button><div className="min-w-0 flex-1"><h2 data-discussion-status aria-describedby="discussion-thread-status" className="break-words font-heading text-body-base font-bold">{question.title}</h2><span id="discussion-thread-status" className="sr-only">{t(question.status === "open" ? "status_open" : question.status === "answered" ? "status_answered" : "status_resolved")}</span><div className="mt-1 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground"><ChannelName channel={channel} /></div></div>{question.canResolve && props.onSetQuestionStatus && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t(question.status === "resolved" ? "reopen" : "resolve")} className="size-8 px-0 @min-[32rem]/discussions:w-auto @min-[32rem]/discussions:px-3" isLoading={statusPending} onClick={() => void toggleStatus()}>{question.status === "resolved" ? <RotateCcw /> : <CheckCircle2 />}<span className="hidden @min-[32rem]/discussions:inline">{t(question.status === "resolved" ? "reopen" : "resolve")}</span></Button></TooltipTrigger><TooltipContent>{t(question.status === "resolved" ? "reopen" : "resolve")}</TooltipContent></Tooltip>}</div>{statusError && <p role="alert" className="mt-1 text-body-xs text-destructive">{t("statusError")}</p>}</div>
            <div data-discussion-messages className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 @min-[52rem]/discussions:p-5">{props.hasMoreMessages && props.onLoadMoreMessages && <LoadMore onLoad={props.onLoadMoreMessages} label={t("loadMessages")} />}{props.messages.length ? props.messages.map((message) => <DiscussionMessage key={message.id} message={message} questionId={question.id} viewer={props.viewer} sourceChannel={channel} forwardDraft={forwardDrafts[message.id]} updateForwardDraft={(change) => updateForwardDraft(message.id, change)} onSearchChannels={props.onSearchChannels} onSearchForwardTargets={props.onSearchForwardTargets} canReply={question.canReply} targeted={message.id === props.selectedMessageId} replyDisabled={threadDraft.sending || threadLocked} onReply={replyTo} onEdit={props.onEditMessage} onDelete={props.onDeleteMessage} onReact={props.onToggleReaction} onForward={props.onForwardMessage} onReport={props.onReportMessage} renderAttachment={process.env.NODE_ENV === "development" ? props.renderAttachment : undefined} />) : <AdminEmptyState icon={MessageSquareText} title={t("noMessages")} />}</div>
            {(question.canReply || threadDraft.sending || threadDraft.body.length > 0 || threadDraft.images.length > 0 || threadDraft.replyTo) && <div className="flex max-h-[80%] min-h-0 flex-col border-t border-border p-3"><DiscussionComposer draft={question.canReply || threadLocked ? threadDraft : { ...threadDraft, error: "resolved" }} update={(change) => updateDraft(draftKey, change)} channelId={channel.id} audienceHelp={t(discussionAudienceKey(channel, props.viewer.role))} zyraUnscoped={!channel.courseId && channel.kind !== "course"} questionId={question.id} viewer={props.viewer} onSearchMentions={props.onSearchMentions} onUpload={props.onUploadImage} onSubmit={({ viewerId: _viewerId, channelId: _channelId, questionId, questionDetails: _details, replyToMessageId, ...input }) => props.onSendReply({ ...input, questionId: questionId!, messageType: replyToMessageId ? "reply" : "answer", replyToMessageId })} submitDisabled={!question.canReply && !threadLocked} submitLabel={t(threadDraft.replyTo ? "sendReply" : "sendAnswer")} /></div>}
          </>}</section>
        </div>
      </TabsContent>
      {canReport && <TabsContent value="reports"><DiscussionReports state={props.reportState} onRetry={props.onRetryReports} reports={props.reports!} onSetStatus={props.onSetReportStatus} onOpenQuestion={(id, messageId) => { if (!props.onTabChange) setUrlTab("questions"); props.onSelectQuestion(id, messageId); }} /></TabsContent>}
    </Tabs>
    <Dialog open={newOpen} onOpenChange={setNewOpen}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{t("newQuestion")}</DialogTitle></DialogHeader>
        <DiscussionComposer
          draft={newDraft}
          update={(change) => updateDraft("new", change)}
          channelId={newChannelId}
          audienceHelp={newChannel ? t(discussionAudienceKey(newChannel, props.viewer.role)) : undefined}
          zyraUnscoped={newChannel ? !newChannel.courseId && newChannel.kind !== "course" : undefined}
          viewer={props.viewer}
          onSearchMentions={props.onSearchMentions}
          onUpload={props.onUploadImage}
          disabled={!newChannel}
          submitDisabled={!newTitle.trim() && !newLocked}
          questionDetails={{ title: newTitle.trim(), helpKind: newChannel?.kind === "private" ? newChannel.privateKind === "academic" ? "academic" : newHelpKind : undefined }}
          onSubmit={({ viewerId: _viewerId, channelId, questionId: _questionId, questionDetails, ...input }) => props.onCreateQuestion({ ...input, channelId, title: questionDetails!.title, helpKind: questionDetails!.helpKind })}
          onSuccess={() => { setNewOpen(false); setNewTitle(""); setNewChannel(null); setNewAudience("together"); setTeamError(false); }}
          submitLabel={t("sendQuestion")}
          beforeContent={<div className="space-y-3">
            <div className={cn("grid gap-3", props.onPrepareTeamChannel && newAudience === "together" && "sm:grid-cols-2")}>
            {props.onPrepareTeamChannel && <div className="space-y-1.5">
              <Label htmlFor="discussion-audience">{t("audience")}</Label>
              <Select value={newAudience} onValueChange={(value) => changeAudience(value as "together" | "academic" | "technical")} disabled={newDraft.sending || newLocked || newDraft.images.length > 0 || preparingTeam}>
                <SelectTrigger id="discussion-audience"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="together">{t("audienceTogether")}</SelectItem><SelectItem value="academic">{t("audienceAcademic")}</SelectItem><SelectItem value="technical">{t("audienceTechnical")}</SelectItem></SelectContent>
              </Select>
              {preparingTeam && <p role="status" className="text-body-xs text-muted-foreground">{t("loadingChannels")}</p>}
              {(teamError || (!newChannel && !preparingTeam)) && newAudience !== "together" && <div role="alert" className="flex flex-wrap items-center gap-2 text-body-xs text-destructive"><span>{t("channelsError")}</span><Button type="button" variant="outline" size="sm" onClick={() => void prepareTeam(newAudience)}>{t("retry")}</Button></div>}
            </div>}
            <div className="space-y-1.5">
              {(!props.onPrepareTeamChannel || newAudience === "together") && <><Label>{t("channel")}</Label><DiscussionChannelPicker value={newChannel} label={t("channel")} placeholder={t("chooseChannel")} onSearch={props.onSearchChannels} onChange={(next) => { setNewChannel(next); if (next?.kind === "private" && next.privateKind !== "academic") setNewHelpKind(next.privateKind); updateDraft("new", (draft) => ({ ...draft, requestId: undefined })); }} disabled={newDraft.sending || newLocked || newDraft.images.length > 0} /></>}
              {props.onPrepareTeamChannel && newAudience !== "together" && newChannel && <div className="text-body-xs text-muted-foreground"><ChannelName channel={newChannel} /></div>}
              {newDraft.images.length > 0 && <p className="text-body-xs text-muted-foreground">{t("removeImagesToChangeChannel")}</p>}
            </div>
            </div>
            {newChannel?.kind === "private" && newChannel.privateKind !== "academic" && <div className="space-y-1.5">
              <Label htmlFor="discussion-help-kind">{t("helpKind")}</Label>
              <Select value={newHelpKind} onValueChange={(value) => { setNewHelpKind(value as Exclude<DiscussionPrivateKind, "academic">); updateDraft("new", (draft) => ({ ...draft, requestId: undefined })); }} disabled={newDraft.sending || newLocked}>
                <SelectTrigger id="discussion-help-kind"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="bug">{t("private_bug")}</SelectItem><SelectItem value="feature">{t("private_feature")}</SelectItem><SelectItem value="operations">{t("private_operations")}</SelectItem></SelectContent>
              </Select>
            </div>}
            <div className="space-y-1.5"><Label htmlFor="discussion-new-title">{t("questionTitle")}</Label><Input id="discussion-new-title" value={newTitle} onChange={(event) => { setNewTitle(event.target.value); updateDraft("new", (draft) => ({ ...draft, requestId: undefined })); }} maxLength={160} disabled={newDraft.sending || newLocked} placeholder={t("questionPlaceholder")} /></div>
          </div>}
        />
      </DialogContent>
    </Dialog>
  </div></TooltipProvider>;
}

export type { DiscussionWorkspaceProps } from "./view-model";
