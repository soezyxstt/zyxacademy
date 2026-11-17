"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { ChevronDown, Flag, Forward, MessageSquareReply, Pencil, Plus, Trash2 } from "lucide-react";
import { ZyraBubbleSkin } from "@/components/gamification/zyra-bubble-skin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiscussionAttachment } from "./discussion-attachment";
import { canSuggestForwardChannel, channelOptionIndex, discussionMessageHref } from "./discussion-adapter";
import { DiscussionMarkdown } from "./discussion-markdown";
import type { DiscussionChannel, DiscussionForwardDraft, DiscussionForwardTarget, DiscussionMessage as Message, DiscussionPerson, DiscussionWorkspaceProps } from "./view-model";

export type DiscussionChannelTranslator = (
  key:
    | "channelGlobal"
    | "channelAcademicTeam"
    | "channelTechnicalTeam"
    | "channelAcademicHelp"
    | "channelBug"
    | "channelFeature"
    | "channelOperations"
    | "channelCourseUnavailable"
    | "role_unknown"
) => string;

export function discussionChannelName(channel: DiscussionChannel, t: DiscussionChannelTranslator) {
  if (channel.kind === "global") return t("channelGlobal");
  if (channel.kind === "course") return channel.name;
  switch (channel.name) {
    case "Tim akademik": return t("channelAcademicTeam");
    case "Tim teknis": return t("channelTechnicalTeam");
    case "Bantuan akademik": return t("channelAcademicHelp");
    case "Kendala aplikasi": return t("channelBug");
    case "Usulan fitur": return t("channelFeature");
    case "Bantuan operasional": return t("channelOperations");
    default: return channel.name;
  }
}
export function discussionChannelLabel(channel: DiscussionChannel, t: DiscussionChannelTranslator) {
  const name = discussionChannelName(channel, t);
  if (channel.kind !== "private") return name;
  const audience = channel.courseId ? channel.courseTitle || t("channelCourseUnavailable") : t("channelGlobal");
  return [name, ...(channel.requesterName === undefined ? [] : [channel.requesterName || t("role_unknown")]), audience].join(", ");
}
const REACTIONS = ["👍", "❤️", "🎉", "🙏", "🤔"];

function mayEdit(viewer: DiscussionPerson, message: Message) {
  if (!message.canEdit) return false;
  if (viewer.role === "admin") return true;
  const age = Date.now() - Date.parse(message.createdAt);
  return viewer.role !== "zyra" && viewer.id === message.author.id && age >= 0 && age < 5 * 60 * 1000;
}

export function DiscussionChannelPicker({ value, label, placeholder, onChange, onSearch, allowAll = false, disabled = false, source }: {
  value: DiscussionChannel | null; label: string; placeholder: string; onChange: (value: DiscussionChannel | null) => void;
  onSearch: DiscussionWorkspaceProps["onSearchChannels"]; allowAll?: boolean; disabled?: boolean; source?: DiscussionChannel;
}) {
  const t = useTranslations("discussions");
  const { locale } = useAppLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<Array<Record<string, string | null>>>([{}]);
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("ready");
  const [page, setPage] = useState<{ items: DiscussionChannel[]; nextCursor: Record<string, string | null> | null }>({ items: [], nextCursor: null });
  const optionsRef = useRef<HTMLDivElement>(null);
  const searchChannels = useRef(onSearch);
  const sourceRef = useRef(source);
  const tRef = useRef(t);
  useEffect(() => {
    searchChannels.current = onSearch;
    sourceRef.current = source;
    tRef.current = t;
  }, [onSearch, source, t]);
  useEffect(() => { setCursors([{}]); setIndex(0); }, [locale]);
  useEffect(() => {
    if (!open) return;
    const activeSource = sourceRef.current;
    const translate = tRef.current;
    if (activeSource?.kind === "private") { setPage({ items: discussionChannelLabel(activeSource, translate).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? [activeSource] : [], nextCursor: null }); setState("ready"); return; }
    let cancelled = false;
    setPage({ items: [], nextCursor: null });
    setState("loading");
    const timer = setTimeout(() => {
      const currentSource = sourceRef.current;
      const currentT = tRef.current;
      const query = search.trim();
      const cursor = cursors[index];
      const input = { search: query, courseId: currentSource?.kind === "course" ? currentSource.courseId ?? undefined : undefined, kind: currentSource?.kind === "course" ? "course" as const : undefined, kinds: currentSource?.kind === "global" ? ["global", "course"] as ("global" | "course")[] : undefined };
      const aliases = [["channelGlobal", "Umum"], ["channelAcademicTeam", "akademik"], ["channelAcademicHelp", "akademik"], ["channelTechnicalTeam", "teknis"], ["channelBug", "kendala"], ["channelFeature", "fitur"], ["channelOperations", "operasional"]] as const;
      const matches = locale === "en" && query.length >= 2 && currentSource?.kind !== "course"
        ? new Set(aliases.filter(([key]) => currentT(key).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(([, value]) => value)) : new Set<string>();
      const streams = [["raw", query], ...[...matches].filter((value) => value.toLocaleLowerCase() !== query.toLocaleLowerCase()).map((value) => [`alias:${value}`, value])] as [string, string][];
      void Promise.all(streams.map(([key, value]) => cursor[key] === null ? null : searchChannels.current({ ...input, search: value, cursor: cursor[key] ?? undefined }))).then((results) => {
        if (cancelled) return;
        const items = [...new Map(results.flatMap((result, stream) => (result?.items ?? []).filter((item) =>
          (stream === 0 || item.kind !== "course" && discussionChannelName(item, currentT).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
          (!currentSource || canSuggestForwardChannel(currentSource, item)))).map((item) => [item.id, item] as const)).values()];
        const nextCursor = results.some((result) => result?.nextCursor) ? Object.fromEntries(streams.map(([key], stream) => [key, results[stream]?.nextCursor ?? null])) : null;
        setPage({ items, nextCursor }); setState("ready");
      }).catch(() => { if (!cancelled) setState("error"); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, search, index, cursors, retry, locale, source?.id, source?.kind, source?.courseId]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="h-auto min-h-8 w-full min-w-0 whitespace-normal py-1 text-left [&>span]:justify-between"><span className="min-w-0 break-words">{value ? discussionChannelLabel(value, t) : placeholder}</span><ChevronDown /></Button></PopoverTrigger>
    <PopoverContent aria-label={label} align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)] space-y-2 p-2">
      <Input aria-label={t("searchChannel")} placeholder={t("searchChannel")} value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 160)); setCursors([{}]); setIndex(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); optionsRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); } }} />
      <div ref={optionsRef} role="listbox" aria-label={label} className="max-h-48 overflow-y-auto" onKeyDown={(event) => { const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')); const next = channelOptionIndex(event.key, options.findIndex((option) => option === document.activeElement), options.length); if (next === null) return; event.preventDefault(); options[next]?.focus(); }}>{allowAll && <Button type="button" role="option" aria-selected={!value} variant="ghost" className="w-full [&>span]:justify-start" onClick={() => { onChange(null); setOpen(false); }}>{t("allChannels")}</Button>}{page.items.map((item) => <Button key={item.id} type="button" role="option" aria-selected={value?.id === item.id} variant="ghost" className="h-auto w-full whitespace-normal break-words py-1 text-left [&>span]:justify-start" onClick={() => { onChange(item); setOpen(false); }}>{discussionChannelLabel(item, t)}</Button>)}</div>
      {state === "loading" ? <p role="status" className="text-body-xs text-muted-foreground">{t("loadingChannels")}</p> : state === "error" ? <div role="alert" className="flex items-center gap-2 text-body-xs text-destructive">{t("channelsError")}<Button type="button" variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("retry")}</Button></div> : !page.items.length ? <p className="text-body-xs text-muted-foreground">{t("noChannelsPage")}</p> : null}
      <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={state === "loading" || index === 0} onClick={() => setIndex((value) => value - 1)}>{t("previous")}</Button><span className="shrink-0 whitespace-nowrap text-body-xs text-muted-foreground">{t("page", { page: index + 1 })}</span><Button type="button" variant="outline" size="sm" disabled={state !== "ready" || !page.nextCursor} onClick={() => { setCursors((items) => [...items.slice(0, index + 1), page.nextCursor!]); setIndex((value) => value + 1); }}>{t("next")}</Button></div>
    </PopoverContent>
  </Popover>;
}

type MessageProps = {
  message: Message;
  questionId: string;
  viewer: DiscussionPerson;
  sourceChannel: DiscussionChannel;
  forwardDraft?: DiscussionForwardDraft;
  updateForwardDraft: (change: (draft: DiscussionForwardDraft | undefined) => DiscussionForwardDraft | undefined) => void;
  onSearchChannels: DiscussionWorkspaceProps["onSearchChannels"];
  onSearchForwardTargets: DiscussionWorkspaceProps["onSearchForwardTargets"];
  canReply: boolean;
  replyDisabled?: boolean;
  targeted?: boolean;
  onReply: (message: Message) => void;
  onEdit: DiscussionWorkspaceProps["onEditMessage"];
  onDelete: DiscussionWorkspaceProps["onDeleteMessage"];
  onReact: DiscussionWorkspaceProps["onToggleReaction"];
  onForward: DiscussionWorkspaceProps["onForwardMessage"];
  onReport: DiscussionWorkspaceProps["onReportMessage"];
  renderAttachment?: DiscussionWorkspaceProps["renderAttachment"];
};

export async function deliverDiscussionForward(draft: DiscussionForwardDraft, source: { questionId: string; messageId: string }, update: MessageProps["updateForwardDraft"], onForward: MessageProps["onForward"]) {
  if (!draft.targetChannel || !draft.targetQuestion || draft.status === "sending" || draft.status === "replay_unverified") return;
  const { requestId, status } = draft;
  update(current => current?.requestId === requestId ? { ...current, status: "sending" } : current);
  let failure;
  try { failure = await onForward({ ...source, targetChannelId: draft.targetChannel.id, targetQuestionId: draft.targetQuestion, requestId }); }
  catch { failure = "unknown" as const; }
  update(current => {
    if (current?.requestId !== requestId) return current;
    if (failure && typeof failure === "object") return { ...current, status: "replay_unverified", replayTarget: failure.target };
    if (failure === "unknown" || failure && status === "unknown") return { ...current, status: "unknown", error: failure };
    if (failure) return { ...current, status: "ready" };
    return undefined;
  });
  return failure;
}

export function DiscussionMessage({ message, questionId, viewer, sourceChannel, forwardDraft, updateForwardDraft, onSearchChannels, onSearchForwardTargets, canReply: threadCanReply, replyDisabled = false, targeted = false, onReply, onEdit, onDelete, onReact, onForward, onReport, renderAttachment }: MessageProps) {
  const t = useTranslations("discussions");
  const visibleBody = message.bodyKind === "deleted" ? t("deletedMessage") : message.bodyKind === "source_unavailable" ? t("sourceUnavailable") : message.body;
  const quote = message.replyTo;
  const quoteAuthor = quote?.authorKind === "deleted" ? t("deletedAuthor") : quote?.authorKind === "unavailable" ? t("unknownAuthor") : quote?.authorName;
  const quoteExcerpt = quote?.excerptKind === "deleted" ? t("deletedMessage") : quote?.excerptKind === "image" ? t("image") : quote?.excerptKind === "source_unavailable" ? t("sourceUnavailable") : quote?.excerpt;
  const canReply = threadCanReply && message.canReply !== false;
  const canForward = message.canForward !== false && message.messageType !== "forward";
  const canReact = message.canReact !== false;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | "report" | null>(null);
  const [forwardDismissed, setForwardDismissed] = useState(false);
  const activeDialog = forwardDraft && !forwardDismissed ? "forward" : dialog;
  const [body, setBody] = useState(message.body);
  const [editingRevision, setEditingRevision] = useState(message.revision);
  const [reason, setReason] = useState("");
  const targetChannel = forwardDraft?.targetChannel ?? null;
  const target = targetChannel?.id ?? "";
  const targetQuestion = forwardDraft?.targetQuestion ?? "";
  const [targetSearch, setTargetSearch] = useState("");
  const [targetPage, setTargetPage] = useState<{ items: DiscussionForwardTarget[]; nextCursor: string | null }>({ items: [], nextCursor: null });
  const [targetCursors, setTargetCursors] = useState<Array<string | undefined>>([undefined]);
  const [targetPageIndex, setTargetPageIndex] = useState(0);
  const [targetState, setTargetState] = useState<"loading" | "ready" | "error">("ready");
  const [targetRetry, setTargetRetry] = useState(0);
  const searchForwardTargets = useRef(onSearchForwardTargets);
  useEffect(() => { searchForwardTargets.current = onSearchForwardTargets; }, [onSearchForwardTargets]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"" | "actionError" | "editExpired" | "emptyMessage" | "sendError_unknown">("");
  const forwardLocked = !!forwardDraft && forwardDraft.status !== "ready";
  const [retry, setRetry] = useState<(() => Promise<void | false>) | null>(null);
  const forwardInFlight = useRef(false);
  const gesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean; vertical: boolean; longPressed: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  const canDelete = message.canDelete && (viewer.role === "admin" || viewer.id === message.author.id);

  useEffect(() => () => { if (gesture.current) clearTimeout(gesture.current.timer); }, []);
  useEffect(() => {
    if (activeDialog !== "forward" || !target) return;
    let cancelled = false;
    setTargetPage({ items: [], nextCursor: null });
    setTargetState("loading");
    const timer = setTimeout(() => {
      void searchForwardTargets.current({ channelId: target, search: targetSearch.trim(), cursor: targetCursors[targetPageIndex] }).then((page) => {
        if (!cancelled) { setTargetPage({ ...page, items: page.items.filter((item) => item.questionId !== questionId && item.channelId === target) }); setTargetState("ready"); }
      }).catch(() => { if (!cancelled) setTargetState("error"); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeDialog, target, targetSearch, targetPageIndex, targetCursors, targetRetry, questionId]);

  function startGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current || event.pointerType !== "touch" || event.clientX < 28 || event.clientX > window.innerWidth - 28 || (event.target as HTMLElement).closest("button,a,input,textarea,select")) return;
    const state = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, vertical: false, longPressed: false, timer: setTimeout(() => { state.longPressed = true; setMenuOpen(true); }, 550) };
    gesture.current = state;
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const dx = Math.abs(event.clientX - state.x);
    const dy = Math.abs(event.clientY - state.y);
    if (dy > 10 && dy > dx) state.vertical = true;
    if (dx > 10 || dy > 10) {
      state.moved = true;
      clearTimeout(state.timer);
    }
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const state = gesture.current;
    if (!state || event.pointerId !== state.pointerId) return;
    clearTimeout(state.timer);
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (canReply && !replyDisabled && !cancelled && !state.vertical && !state.longPressed && state.moved && Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5) onReply(message);
    gesture.current = null;
  }

  async function run(action: () => Promise<void | false>, closeDialog = false) {
    if (pending) return;
    setPending(true);
    setError("");
    setRetry(null);
    try {
      const result = await action();
      if (closeDialog && result !== false) { setDialog(null); setReason(""); }
    } catch {
      setError("actionError");
      if (!closeDialog) setRetry(() => action);
    } finally {
      setPending(false);
    }
  }

  function openDialog(next: "edit" | "delete" | "forward" | "report") {
    setError("");
    setRetry(null);
    setBody(message.body);
    setEditingRevision(message.revision);
    if (next === "forward") {
      setForwardDismissed(false);
      const requestId = crypto.randomUUID();
      updateForwardDraft(current => current ?? { targetChannel: null, targetQuestion: "", targetTitle: "", requestId, status: "ready" });
      setTargetSearch(""); setTargetCursors([undefined]); setTargetPageIndex(0);
    } else setDialog(next);
  }

  async function submitDialog() {
    if (dialog === "edit") {
      if (!mayEdit(viewer, message)) { setError("editExpired"); return; }
      if (!body.trim() && message.attachments.length === 0) { setError("emptyMessage"); return; }
      if (message.revision !== editingRevision) return;
      await run(() => onEdit({ questionId, messageId: message.id, body: body.trim(), revision: editingRevision }), true);
    } else if (dialog === "delete") await run(() => onDelete({ questionId, messageId: message.id }), true);
    else if (activeDialog === "forward" && forwardDraft && target && targetQuestion && !forwardInFlight.current && forwardDraft.status !== "sending" && forwardDraft.status !== "replay_unverified") {
      forwardInFlight.current = true;
      setError("");
      try {
        const failure = await deliverDiscussionForward(forwardDraft, { questionId, messageId: message.id }, updateForwardDraft, onForward);
        if (failure && typeof failure !== "object" && failure !== "unknown" && forwardDraft.status !== "unknown") setError("actionError");
      } finally { forwardInFlight.current = false; }
    }
    else if (dialog === "report" && reason.trim()) await run(() => onReport({ questionId, messageId: message.id, reason: reason.trim() }), true);
  }

  return <div data-message-id={message.id} data-discussion-target={targeted || undefined} tabIndex={targeted ? -1 : undefined} className={`min-w-0 touch-pan-y ${targeted ? "rounded-lg ring-2 ring-primary" : ""}`} onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={(event) => endGesture(event, true)}>
    <div className="flex min-w-0 gap-2.5">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-body-xs font-bold text-primary">{message.author.name.trim().slice(0, 2).toUpperCase()}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-start gap-1.5"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"><span className="min-w-0 break-words text-body-sm font-semibold">{message.author.name}</span><span className="rounded-md bg-muted px-1.5 py-0.5 text-body-xs text-muted-foreground">{t(message.author.role === "student" ? "role_student" : message.author.role === "tutor" ? "role_tutor" : message.author.role === "admin" ? "role_admin" : message.author.role === "zyra" ? "role_zyra" : "role_unknown")}</span><span className="text-body-xs text-muted-foreground"><FormattedDate date={message.createdAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} /></span></div><span className="w-7 shrink-0">{(canReply || canForward || mayEdit(viewer, message) || canDelete || message.canReport) && <>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("messageActionsFor", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 100) || t("image") })}><ChevronDown /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t("messageActions")}</TooltipContent></Tooltip><DropdownMenuContent>{canReply && <DropdownMenuItem disabled={replyDisabled} onSelect={() => { if (!replyDisabled) onReply(message); }}><MessageSquareReply /> {t("reply")}</DropdownMenuItem>}{mayEdit(viewer, message) && <DropdownMenuItem onSelect={() => openDialog("edit")}><Pencil /> {t("edit")}</DropdownMenuItem>}{canForward && <DropdownMenuItem onSelect={() => openDialog("forward")}><Forward /> {t("forward")}</DropdownMenuItem>}{message.canReport && <DropdownMenuItem onSelect={() => openDialog("report")}><Flag /> {t("report")}</DropdownMenuItem>}{canDelete && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => openDialog("delete")}><Trash2 /> {t("delete")}</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
        </>}</span></div>
        <ZyraBubbleSkin skinId={message.skinId} role={message.author.role === "zyra" ? "assistant" : "user"} className={message.skinId ? undefined : "rounded-xl border border-border bg-card p-3"}>
          <p className="mb-1 text-body-xs font-semibold text-muted-foreground">{t(message.messageType === "question" ? "messageType_question" : message.messageType === "answer" ? "messageType_answer" : message.messageType === "reply" ? "messageType_reply" : message.messageType === "forward" ? "messageType_forward" : "messageType_unknown")}</p>
          {quote && <div className="mb-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1 text-body-xs"><span className="font-semibold">{quoteAuthor}</span><div className="line-clamp-2 break-words text-muted-foreground [&_div]:text-body-xs [&_p]:text-body-xs"><DiscussionMarkdown content={(quoteExcerpt ?? "").slice(0, 600)} /></div></div>}
          <div data-discussion-content>{visibleBody && <DiscussionMarkdown content={visibleBody} />}
          {message.attachments.map((attachment) => <div key={attachment.id} className="mt-2 w-60 max-w-full">{renderAttachment ? renderAttachment(attachment) : <DiscussionAttachment attachment={attachment} />}</div>)}</div>
          {message.editedAt && <p className="mt-1 text-body-xs text-muted-foreground">{t("edited")}</p>}
        </ZyraBubbleSkin>
        {canReact && <div className="flex flex-wrap items-center gap-1">{message.reactions.filter((reaction) => reaction.count > 0).map((reaction) => <Button key={reaction.emoji} type="button" variant={reaction.selected ? "secondary" : "outline"} size="xs" aria-label={`${t("reaction", { emoji: reaction.emoji, count: reaction.count })}. ${t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}`} aria-pressed={reaction.selected} disabled={pending} onClick={() => void run(() => onReact({ questionId, messageId: message.id, emoji: reaction.emoji, selected: !reaction.selected }))}>{reaction.emoji} {reaction.count}</Button>)}
          <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("addReaction")}. ${t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}`} disabled={pending}><Plus /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t("addReaction")}</TooltipContent></Tooltip><DropdownMenuContent>{REACTIONS.map((emoji) => <DropdownMenuItem key={emoji} onSelect={() => void run(() => onReact({ questionId, messageId: message.id, emoji, selected: !message.reactions.find((reaction) => reaction.emoji === emoji)?.selected }))}>{emoji}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
        </div>}
        {error && !activeDialog && <p role="alert" className="text-body-xs text-destructive">{t(error)} {retry && <Button type="button" variant="link" size="xs" disabled={pending} onClick={() => void run(retry)}>{t("retry")}</Button>}</p>}
      </div>
    </div>
    <Dialog open={activeDialog !== null} onOpenChange={(open) => { if (!open && !pending) { if (activeDialog === "forward") { setForwardDismissed(true); if (!forwardLocked) updateForwardDraft(() => undefined); } else setDialog(null); setError(""); } }}>
      <DialogContent {...(activeDialog === "delete" ? {} : { "aria-describedby": undefined })}><DialogHeader><DialogTitle>{activeDialog === "edit" ? t("editMessage") : activeDialog === "delete" ? t("deleteMessage") : activeDialog === "forward" ? t("forwardMessage") : t("reportMessage")}</DialogTitle>{activeDialog === "delete" && <DialogDescription className="min-w-0 [overflow-wrap:anywhere]">{t("deleteDescription")} {t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}</DialogDescription>}</DialogHeader>
        {activeDialog === "edit" && <><Textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label={t("messageBody")} maxLength={12_000} disabled={pending} />{message.revision !== editingRevision && <div role="alert" className="space-y-2 rounded-md border border-border p-3 text-body-xs"><p className="text-body-xs">{t("messageChanged")}</p><DiscussionMarkdown content={message.body} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setBody(message.body); setEditingRevision(message.revision); setError(""); }}>{t("useLatest")}</Button><Button type="button" size="sm" variant="outline" onClick={() => { setEditingRevision(message.revision); setError(""); }}>{t("keepDraft")}</Button></div></div>}</>}
        {activeDialog === "forward" && <div className="space-y-2">
          <DiscussionChannelPicker value={targetChannel} label={t("targetChannel")} placeholder={t("chooseChannel")} source={sourceChannel} onSearch={onSearchChannels} onChange={(value) => { const requestId = crypto.randomUUID(); updateForwardDraft(current => current && { ...current, targetChannel: value, targetQuestion: "", targetTitle: "", requestId }); setTargetSearch(""); setTargetCursors([undefined]); setTargetPageIndex(0); }} disabled={forwardLocked} />
          <Input value={targetSearch} onChange={(event) => { setTargetSearch(event.target.value.slice(0, 160)); updateForwardDraft(current => current && { ...current, targetQuestion: "", targetTitle: "" }); setTargetCursors([undefined]); setTargetPageIndex(0); }} aria-label={t("searchTarget")} placeholder={t("searchQuestion")} disabled={forwardLocked || !target} />
          <Select value={targetQuestion} onValueChange={(value) => { const requestId = crypto.randomUUID(); updateForwardDraft(current => current && { ...current, targetQuestion: value, targetTitle: targetPage.items.find(item => item.questionId === value)?.title ?? "", requestId }); }} disabled={forwardLocked || !target || targetState !== "ready" || !targetPage.items.length}><SelectTrigger aria-label={t("targetQuestion")} className="h-auto min-h-10 text-left [&>span]:whitespace-normal [&>span]:[overflow-wrap:anywhere]"><SelectValue placeholder={t("chooseQuestion")}>{forwardDraft?.targetTitle || undefined}</SelectValue></SelectTrigger><SelectContent collisionPadding={16} className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">{targetPage.items.map((item) => <SelectItem key={item.questionId} value={item.questionId} className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{item.title}</SelectItem>)}</SelectContent></Select>
          {target && (targetState === "loading" ? <p role="status" className="text-body-xs text-muted-foreground">{t("loadingQuestions")}</p> : targetState === "error" ? <div role="alert" className="flex items-center gap-2 text-body-xs text-destructive">{t("targetError")}<Button type="button" variant="outline" size="sm" onClick={() => setTargetRetry((value) => value + 1)}>{t("retry")}</Button></div> : !targetPage.items.length ? <p className="text-body-xs text-muted-foreground">{t("noQuestionsPage")}</p> : null)}
          {target && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={forwardLocked || targetState === "loading" || targetPageIndex === 0} onClick={() => { updateForwardDraft(current => current && { ...current, targetQuestion: "", targetTitle: "" }); setTargetPageIndex((index) => index - 1); }}>{t("previous")}</Button><span className="text-body-xs text-muted-foreground">{t("page", { page: targetPageIndex + 1 })}</span><Button type="button" variant="outline" size="sm" disabled={forwardLocked || targetState !== "ready" || !targetPage.nextCursor} onClick={() => { updateForwardDraft(current => current && { ...current, targetQuestion: "", targetTitle: "" }); setTargetCursors((cursors) => [...cursors.slice(0, targetPageIndex + 1), targetPage.nextCursor!]); setTargetPageIndex((index) => index + 1); }}>{t("next")}</Button></div>}
        </div>}
        {activeDialog === "report" && <Textarea value={reason} onChange={(event) => setReason(event.target.value)} aria-label={t("reportReason")} placeholder={t("reportReason")} maxLength={1000} disabled={pending} />}
        {forwardDraft?.replayTarget && activeDialog === "forward" && <div role="alert" className="space-y-2 text-body-xs"><p className="text-body-xs">{t("sendError_replay_unverified")}</p><Button asChild variant="outline" size="sm"><a href={discussionMessageHref(forwardDraft.replayTarget)} target="_blank" rel="noopener noreferrer">{t("inspectPrevious")}</a></Button></div>}
        {(forwardDraft?.status === "unknown" && activeDialog === "forward" || error) && <p role="alert" className="text-body-xs text-destructive">{t(forwardDraft?.status === "unknown" && activeDialog === "forward" ? (forwardDraft.error === "resolved" ? "forwardResolvedUnknown" : "sendError_unknown") : error)}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending || forwardDraft?.status === "sending"} onClick={() => { if (activeDialog === "forward") updateForwardDraft(() => undefined); else setDialog(null); setError(""); }}>{t(activeDialog === "forward" && forwardLocked ? "discardPending" : "cancel")}</Button><Button type="button" variant={activeDialog === "delete" ? "destructive" : "default"} isLoading={pending || forwardDraft?.status === "sending"} disabled={forwardDraft?.status === "sending" || forwardDraft?.status === "replay_unverified" || (activeDialog === "edit" && editingRevision !== message.revision) || (activeDialog === "forward" && (!target || !targetQuestion)) || (activeDialog === "report" && !reason.trim())} onClick={() => void submitDialog()}>{activeDialog === "delete" ? t("delete") : activeDialog === "forward" ? t("forward") : activeDialog === "report" ? t("sendReport") : t("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
