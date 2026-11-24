"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { Check, ChevronDown, Flag, Forward, MessageSquareReply, Pencil, Plus, Trash2 } from "lucide-react";
import { ZyraBubbleSkin } from "@/components/gamification/zyra-bubble-skin";
import { getZyraChatSkin } from "@/lib/gamification/zyra-cosmetics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  hapticError,
  hapticHeavy,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
} from "@/lib/native/haptics";
import { DiscussionAttachment } from "./discussion-attachment";
import { canSuggestForwardChannel, channelOptionIndex, mentionHandle, discussionMessageHref, zyraStatusReaction } from "./discussion-adapter";
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

export function DiscussionChannelPicker({ value, label, placeholder, onChange, onSearch, allowAll = false, disabled = false, source, triggerClassName, singleLine = false }: {
  value: DiscussionChannel | null; label: string; placeholder: string; onChange: (value: DiscussionChannel | null) => void;
  onSearch: DiscussionWorkspaceProps["onSearchChannels"]; allowAll?: boolean; disabled?: boolean; source?: DiscussionChannel;
  triggerClassName?: string; singleLine?: boolean;
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
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          singleLine
            ? "h-9 w-full min-w-0 py-0 text-left [&>span]:justify-between"
            : "h-auto min-h-9 w-full min-w-0 whitespace-normal py-1 text-left [&>span]:justify-between",
          "px-2 data-[state=open]:bg-muted",
          triggerClassName
        )}
      >
        <span className={singleLine ? "min-w-0 flex-1 truncate" : "min-w-0 break-words"}>{value ? discussionChannelLabel(value, t) : placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
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
  channels?: DiscussionChannel[];
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
  onViewProfile?: (author: DiscussionPerson) => void;
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

export function DiscussionMessage({ message, questionId, viewer, sourceChannel, channels, forwardDraft, updateForwardDraft, onSearchChannels, onSearchForwardTargets, canReply: threadCanReply, replyDisabled = false, targeted = false, onReply, onEdit, onDelete, onReact, onForward, onReport, onViewProfile, renderAttachment }: MessageProps) {
  const t = useTranslations("discussions");
  const visibleBody = message.bodyKind === "deleted" ? t("deletedMessage") : message.bodyKind === "source_unavailable" ? t("sourceUnavailable") : message.body;
  const quote = message.replyTo;
  const quoteAuthor = quote?.authorKind === "deleted" ? t("deletedAuthor") : quote?.authorKind === "unavailable" ? t("unknownAuthor") : quote?.authorName;
  const quoteExcerpt = quote?.excerptKind === "deleted" ? t("deletedMessage") : quote?.excerptKind === "image" ? t("image") : quote?.excerptKind === "source_unavailable" ? t("sourceUnavailable") : quote?.excerpt;
  const canReply = threadCanReply && message.canReply !== false;
  const canForward = message.canForward !== false && message.messageType !== "forward";
  const canReact = message.canReact !== false;
  const isOwn = viewer.role !== "zyra" && Boolean(viewer.id) && message.author.id === viewer.id;
  const canViewAuthorProfile = Boolean(onViewProfile && message.author.role !== "zyra" && message.author.id && message.bodyKind !== "deleted");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | "report" | null>(null);
  const [forwardDismissed, setForwardDismissed] = useState(false);
  const activeDialog = forwardDraft && !forwardDismissed ? "forward" : dialog;
  const [body, setBody] = useState(message.body);
  const [editingRevision, setEditingRevision] = useState(message.revision);
  const [reason, setReason] = useState("");
  const targetChannel = forwardDraft?.targetChannel ?? null;
  const targetQuestion = forwardDraft?.targetQuestion ?? "";
  const [forwardFilterChannel, setForwardFilterChannel] = useState<DiscussionChannel | null>(
    () => (sourceChannel.kind === "course" ? sourceChannel : null),
  );
  const filterChannelId = forwardFilterChannel?.id ?? (sourceChannel.kind === "course" ? sourceChannel.id : undefined);
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
    if (activeDialog !== "forward") return;
    let cancelled = false;
    setTargetPage({ items: [], nextCursor: null });
    setTargetState("loading");
    const timer = setTimeout(() => {
      void searchForwardTargets.current({ channelId: filterChannelId, search: targetSearch.trim(), cursor: targetCursors[targetPageIndex] }).then((page) => {
        if (!cancelled) {
          setTargetPage({
            ...page,
            items: page.items.filter((item) => item.questionId !== questionId && (!filterChannelId || item.channelId === filterChannelId)),
          });
          setTargetState("ready");
        }
      }).catch(() => { if (!cancelled) setTargetState("error"); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeDialog, filterChannelId, targetSearch, targetPageIndex, targetCursors, targetRetry, questionId]);

  function startGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current || event.pointerType !== "touch" || event.clientX < 28 || event.clientX > window.innerWidth - 28 || (event.target as HTMLElement).closest("button,a,input,textarea,select")) return;
    const state = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, vertical: false, longPressed: false, timer: setTimeout(() => { state.longPressed = true; void hapticMedium(); setMenuOpen(true); }, 550) };
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
    if (canReply && !replyDisabled && !cancelled && !state.vertical && !state.longPressed && state.moved && Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      void hapticMedium();
      onReply(message);
    }
    gesture.current = null;
  }

  async function run(action: () => Promise<void | false>, closeDialog = false) {
    if (pending) return;
    setPending(true);
    setError("");
    setRetry(null);
    try {
      const result = await action();
      if (closeDialog && result !== false) {
        if (activeDialog === "delete") void hapticHeavy();
        else void hapticSuccess();
        setDialog(null);
        setReason("");
      }
    } catch {
      void hapticError();
      setError("actionError");
      if (!closeDialog) setRetry(() => action);
    } finally {
      setPending(false);
    }
  }

  function openDialog(next: "edit" | "delete" | "forward" | "report") {
    if (next === "delete") void hapticWarning();
    setError("");
    setRetry(null);
    setBody(message.body);
    setEditingRevision(message.revision);
    if (next === "forward") {
      setForwardDismissed(false);
      setForwardFilterChannel(sourceChannel.kind === "course" ? sourceChannel : null);
      const requestId = crypto.randomUUID();
      updateForwardDraft(current => current ?? { targetChannel: null, targetQuestion: "", targetTitle: "", requestId, status: "ready" });
      setTargetSearch(""); setTargetCursors([undefined]); setTargetPageIndex(0);
    } else setDialog(next);
  }

  function selectForwardQuestion(item: DiscussionForwardTarget) {
    if (forwardLocked) return;
    const resolvedChannel =
      (forwardFilterChannel?.id === item.channelId ? forwardFilterChannel : undefined) ??
      channels?.find((channel) => channel.id === item.channelId) ??
      (sourceChannel.id === item.channelId
        ? sourceChannel
        : {
            id: item.channelId,
            name: item.channelName ?? "",
            kind: "global" as const,
            unreadCount: 0,
            muted: false,
            canCreate: true,
          });
    const requestId = crypto.randomUUID();
    updateForwardDraft(current => current && { ...current, targetChannel: resolvedChannel, targetQuestion: item.questionId, targetTitle: item.title, requestId });
  }

  async function submitDialog() {
    if (dialog === "edit") {
      if (!mayEdit(viewer, message)) { setError("editExpired"); return; }
      if (!body.trim() && message.attachments.length === 0) { setError("emptyMessage"); return; }
      if (message.revision !== editingRevision) return;
      await run(() => onEdit({ questionId, messageId: message.id, body: body.trim(), revision: editingRevision }), true);
    } else if (dialog === "delete") await run(() => onDelete({ questionId, messageId: message.id }), true);
    else if (activeDialog === "forward" && forwardDraft && targetChannel && targetQuestion && !forwardInFlight.current && forwardDraft.status !== "sending" && forwardDraft.status !== "replay_unverified") {
      forwardInFlight.current = true;
      setError("");
      try {
        const failure = await deliverDiscussionForward(forwardDraft, { questionId, messageId: message.id }, updateForwardDraft, onForward);
        if (failure && typeof failure !== "object" && failure !== "unknown" && forwardDraft.status !== "unknown") setError("actionError");
      } finally { forwardInFlight.current = false; }
    }
    else if (dialog === "report" && reason.trim()) await run(() => onReport({ questionId, messageId: message.id, reason: reason.trim() }), true);
  }

  const avatarVisual = message.author.avatarUrl && !avatarFailed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={message.author.avatarUrl} alt={message.author.name} className="size-7 md:size-9 rounded-full object-cover" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
  ) : (
    <span aria-hidden="true" className="flex size-7 md:size-9 items-center justify-center rounded-full bg-primary/10 font-heading text-body-2xs md:text-body-xs font-bold text-primary">{message.author.name.trim().slice(0, 2).toUpperCase()}</span>
  );

  const zyraReaction = message.zyraStatus ? zyraStatusReaction(message.zyraStatus.status, message.zyraStatus.reason) : null;
  const showReactionRow = canReact || Boolean(zyraReaction?.emoji);

  const roleLabel = t(
    message.author.role === "student"
      ? "role_student"
      : message.author.role === "tutor"
        ? "role_tutor"
        : message.author.role === "admin"
          ? "role_admin"
          : message.author.role === "zyra"
            ? "role_zyra"
            : "role_unknown"
  );
  const showRoleBadge = message.author.name.trim().toLowerCase() !== roleLabel.trim().toLowerCase();
  const hasBubbleSkin = Boolean(getZyraChatSkin(message.skinId));

  return <div data-message-id={message.id} data-own-message={isOwn ? "true" : undefined} data-discussion-target={targeted || undefined} tabIndex={targeted ? -1 : undefined} className={cn("min-w-0 touch-pan-y", targeted && "rounded-lg ring-2 ring-primary")} onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={(event) => endGesture(event, true)}>
    <div className={cn("flex min-w-0 items-start gap-2 md:gap-2.5", isOwn && "flex-row-reverse")}>
      {!isOwn ? (
        canViewAuthorProfile ? (
          <button type="button" onClick={() => onViewProfile!(message.author)} aria-label={t("viewProfile", { name: message.author.name })} className="mt-0.5 size-7 md:size-9 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{avatarVisual}</button>
        ) : (
          <span className="mt-0.5 size-7 md:size-9 shrink-0">{avatarVisual}</span>
        )
      ) : null}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", isOwn ? "items-end" : "items-start")}>
        <div className={cn("relative min-w-0 w-fit max-w-[92%] md:max-w-[85%]", isOwn && "mr-1.5")}>
          <ZyraBubbleSkin
            skinId={message.skinId}
            role={message.author.role === "zyra" ? "assistant" : "user"}
            className={cn(
              "min-w-0 w-full",
              isOwn && "!rounded-tr-none",
              hasBubbleSkin
                ? undefined
                : cn(
                    "rounded-2xl border px-2.5 py-1.5 md:px-3.5 md:py-2.5",
                    isOwn
                      ? "border-primary/25 bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))] dark:bg-[color-mix(in_oklab,var(--primary)_15%,var(--background))]"
                      : "rounded-tl-sm border-border bg-card shadow-2xs"
                  )
            )}
          >
            <div className="mb-0.5 md:mb-1 flex min-w-0 items-center justify-between gap-2.5 md:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {canViewAuthorProfile ? (
                <button type="button" onClick={() => onViewProfile!(message.author)} aria-label={t("viewProfile", { name: message.author.name })} className="min-w-0 break-words rounded-sm text-left text-body-xs font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{message.author.name}</button>
              ) : (
                <span className="min-w-0 break-words text-body-xs font-semibold">{message.author.name}</span>
              )}
              {showRoleBadge && (
                <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-body-2xs text-muted-foreground">{roleLabel}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-body-2xs tabular-nums text-muted-foreground"><FormattedDate date={message.createdAt} options={{ hour: "2-digit", minute: "2-digit" }} /></span>
              {(canReply || canForward || mayEdit(viewer, message) || canDelete || message.canReport) && (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" className="size-6 -mr-1 text-muted-foreground hover:text-foreground" aria-label={t("messageActionsFor", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 100) || t("image") })}>
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("messageActions")}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align={isOwn ? "end" : "start"} className="min-w-[8.5rem] p-1">
                    {canReply && <DropdownMenuItem className="gap-2 px-2 py-1.5 text-body-xs" disabled={replyDisabled} onSelect={() => { if (!replyDisabled) onReply(message); }}><MessageSquareReply className="size-3.5" /> {t("reply")}</DropdownMenuItem>}
                    {mayEdit(viewer, message) && <DropdownMenuItem className="gap-2 px-2 py-1.5 text-body-xs" onSelect={() => openDialog("edit")}><Pencil className="size-3.5" /> {t("edit")}</DropdownMenuItem>}
                    {canForward && <DropdownMenuItem className="gap-2 px-2 py-1.5 text-body-xs" onSelect={() => openDialog("forward")}><Forward className="size-3.5" /> {t("forward")}</DropdownMenuItem>}
                    {message.canReport && <DropdownMenuItem className="gap-2 px-2 py-1.5 text-body-xs" onSelect={() => openDialog("report")}><Flag className="size-3.5" /> {t("report")}</DropdownMenuItem>}
                    {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem className="gap-2 px-2 py-1.5 text-body-xs text-destructive" onSelect={() => openDialog("delete")}><Trash2 className="size-3.5" /> {t("delete")}</DropdownMenuItem></>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          {quote && <div className="mb-2 rounded-md border-l-2 border-primary bg-muted/50 px-2.5 py-1.5 text-body-xs"><span className="font-semibold">{quoteAuthor}</span><div className="line-clamp-2 break-words text-muted-foreground [&_div]:text-body-xs [&_p]:text-body-xs"><DiscussionMarkdown content={(quoteExcerpt ?? "").slice(0, 600)} /></div></div>}
          <div data-discussion-content className="min-w-0 text-body-sm md:text-body-base [&_p]:text-body-sm md:[&_p]:text-body-base [&_li]:text-body-sm md:[&_li]:text-body-base">{visibleBody && <DiscussionMarkdown content={visibleBody} renderMention={handle => {
            const token = handle.toLowerCase();
            const matches = message.mentionedPeople?.filter(person =>
              (person.mention ?? mentionHandle(person.id, person.name)).toLowerCase() === token);
            const person = handle.toLowerCase() === "zyra" ? { id: "zyra", name: "Zyra", role: "zyra" as const } : matches?.length === 1 ? matches[0] : undefined;
            if (!person) return matches?.length ? matches[0].name : "@" + handle;
            if (!onViewProfile) return person.name;
            return <button type="button" className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-ring" onClick={() => onViewProfile(person)}>{person.name}</button>;
          }} />}
          {message.attachments.map((attachment) => <div key={attachment.id} className="mt-2 w-60 max-w-full">{renderAttachment ? renderAttachment(attachment) : <DiscussionAttachment attachment={attachment} />}</div>)}</div>
          {message.editedAt && <p className="mt-1 text-body-xs text-muted-foreground">{t("edited")}</p>}
          </ZyraBubbleSkin>
          {isOwn ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 9 11"
              className="pointer-events-none absolute top-0 -right-[7px] h-[11px] w-[9px] overflow-visible"
            >
              <path
                d="M0 0.5 L7.2 0.5 C8.4 0.5 8.8 1.8 7.8 2.7 L0 10.2 Z"
                className={
                  hasBubbleSkin
                    ? "fill-card"
                    : "fill-[color-mix(in_oklab,var(--primary)_10%,var(--background))] dark:fill-[color-mix(in_oklab,var(--primary)_15%,var(--background))]"
                }
              />
              <path
                d="M0 0.5 L7.2 0.5 C8.4 0.5 8.8 1.8 7.8 2.7 L0.5 9.8"
                fill="none"
                strokeWidth="1"
                strokeLinecap="round"
                className={hasBubbleSkin ? "stroke-border" : "stroke-primary/25"}
              />
            </svg>
          ) : null}
        </div>
        {showReactionRow && <div className={cn("flex flex-wrap items-center gap-1", isOwn && "justify-end")}>
          {zyraReaction?.emoji && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="status"
                  tabIndex={0}
                  data-zyra-status={message.zyraStatus?.status}
                  data-zyra-reaction={zyraReaction.emoji}
                  aria-label={t(zyraReaction.key)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-body-xs font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    zyraReaction.tone === "completed"
                      ? "border-primary/25 bg-primary/10 text-foreground"
                      : "border-border bg-muted/60 text-foreground",
                  )}
                >
                  <span aria-hidden="true">{zyraReaction.emoji}</span>
                  <span className="text-body-2xs text-muted-foreground">{t("role_zyra")}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(zyraReaction.key)}</TooltipContent>
            </Tooltip>
          )}
          {canReact && message.reactions.filter((reaction) => reaction.count > 0).map((reaction) => <Button key={reaction.emoji} type="button" variant={reaction.selected ? "secondary" : "outline"} size="xs" className="h-6 rounded-md px-1.5 text-body-xs" aria-label={`${t("reaction", { emoji: reaction.emoji, count: reaction.count })}. ${t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}`} aria-pressed={reaction.selected} disabled={pending} onClick={() => void run(() => onReact({ questionId, messageId: message.id, emoji: reaction.emoji, selected: !reaction.selected }))}>{reaction.emoji} {reaction.count}</Button>)}
          {canReact && <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="size-6 rounded-md text-muted-foreground/70 hover:bg-muted/70 hover:text-foreground" aria-label={`${t("addReaction")}. ${t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}`} disabled={pending}><Plus className="size-3.5" /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t("addReaction")}</TooltipContent></Tooltip><DropdownMenuContent>{REACTIONS.map((emoji) => <DropdownMenuItem key={emoji} onSelect={() => void run(() => onReact({ questionId, messageId: message.id, emoji, selected: !message.reactions.find((reaction) => reaction.emoji === emoji)?.selected }))}>{emoji}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
        </div>}
        {zyraReaction?.tone === "error" && <p role="alert" data-zyra-status={message.zyraStatus?.status} className="text-body-xs text-destructive">{t(zyraReaction.key)}</p>}
        {error && !activeDialog && <p role="alert" className="text-body-xs text-destructive">{t(error)} {retry && <Button type="button" variant="link" size="xs" disabled={pending} onClick={() => void run(retry)}>{t("retry")}</Button>}</p>}
      </div>
    </div>
    <Dialog open={activeDialog !== null} onOpenChange={(open) => { if (!open && !pending) { if (activeDialog === "forward") { setForwardDismissed(true); if (!forwardLocked) updateForwardDraft(() => undefined); } else setDialog(null); setError(""); } }}>
      <DialogContent {...(activeDialog === "delete" ? {} : { "aria-describedby": undefined })}><DialogHeader><DialogTitle>{activeDialog === "edit" ? t("editMessage") : activeDialog === "delete" ? t("deleteMessage") : activeDialog === "forward" ? t("forwardMessage") : t("reportMessage")}</DialogTitle>{activeDialog === "delete" && <DialogDescription className="min-w-0 [overflow-wrap:anywhere]">{t("deleteDescription")} {t("messageReference", { name: message.author.name, seq: message.seq ?? "", excerpt: visibleBody.slice(0, 160) || t("image") })}</DialogDescription>}</DialogHeader>
        {activeDialog === "edit" && <><Textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label={t("messageBody")} maxLength={12_000} disabled={pending} />{message.revision !== editingRevision && <div role="alert" className="space-y-2 rounded-md border border-border p-3 text-body-xs"><p className="text-body-xs">{t("messageChanged")}</p><DiscussionMarkdown content={message.body} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setBody(message.body); setEditingRevision(message.revision); setError(""); }}>{t("useLatest")}</Button><Button type="button" size="sm" variant="outline" onClick={() => { setEditingRevision(message.revision); setError(""); }}>{t("keepDraft")}</Button></div></div>}</>}
        {activeDialog === "forward" && <div className="space-y-3">
          <div data-forward-preview className="rounded-lg border border-border bg-muted/40 p-2.5 text-body-xs">
            <p className="font-semibold text-muted-foreground">{t("forwardPreview")}</p>
            <p className="mt-0.5 font-semibold text-foreground">{message.author.name}</p>
            <p className="line-clamp-2 break-words text-muted-foreground">{visibleBody || t("image")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="sm:w-48 shrink-0">
              <DiscussionChannelPicker
                value={forwardFilterChannel}
                label={t("targetChannel")}
                placeholder={sourceChannel.kind === "global" ? t("allChannels") : t("chooseChannel")}
                allowAll={sourceChannel.kind === "global"}
                source={sourceChannel}
                onSearch={onSearchChannels}
                onChange={(value) => {
                  const requestId = crypto.randomUUID();
                  setForwardFilterChannel(value);
                  updateForwardDraft(current => current && { ...current, targetChannel: null, targetQuestion: "", targetTitle: "", requestId });
                  setTargetSearch(""); setTargetCursors([undefined]); setTargetPageIndex(0);
                }}
                disabled={forwardLocked}
              />
            </div>
            <Input
              value={targetSearch}
              onChange={(event) => {
                setTargetSearch(event.target.value.slice(0, 160));
                setTargetCursors([undefined]);
                setTargetPageIndex(0);
              }}
              aria-label={t("searchTarget")}
              placeholder={t("searchTarget")}
              disabled={forwardLocked}
              className="min-w-0 flex-1"
            />
          </div>
          {targetState === "loading" ? (
            <p role="status" className="text-body-xs text-muted-foreground">{t("loadingQuestions")}</p>
          ) : targetState === "error" ? (
            <div role="alert" className="flex items-center gap-2 text-body-xs text-destructive">{t("targetError")}<Button type="button" variant="outline" size="sm" onClick={() => setTargetRetry((value) => value + 1)}>{t("retry")}</Button></div>
          ) : !targetPage.items.length ? (
            <p className="text-body-xs text-muted-foreground">{t("noQuestionsPage")}</p>
          ) : (
            <div role="listbox" aria-label={t("targetQuestion")} className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {targetPage.items.map((item) => {
                const selected = targetQuestion === item.questionId;
                const channelLabel = item.channelName || channels?.find((channel) => channel.id === item.channelId)?.name;
                return (
                  <button
                    key={item.questionId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={forwardLocked}
                    onClick={() => selectForwardQuestion(item)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
                      selected && "bg-primary/10",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block break-words text-body-sm font-semibold">{item.title}</span>
                      {channelLabel && <span className="mt-0.5 block truncate text-body-xs text-muted-foreground">{channelLabel}</span>}
                    </span>
                    {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
          {(targetPageIndex > 0 || targetPage.nextCursor) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={forwardLocked || targetState === "loading" || targetPageIndex === 0} onClick={() => setTargetPageIndex((index) => index - 1)}>{t("previous")}</Button>
              <span className="text-body-xs text-muted-foreground">{t("page", { page: targetPageIndex + 1 })}</span>
              <Button type="button" variant="outline" size="sm" disabled={forwardLocked || targetState !== "ready" || !targetPage.nextCursor} onClick={() => { setTargetCursors((cursors) => [...cursors.slice(0, targetPageIndex + 1), targetPage.nextCursor!]); setTargetPageIndex((index) => index + 1); }}>{t("next")}</Button>
            </div>
          )}
        </div>}
        {activeDialog === "report" && <Textarea value={reason} onChange={(event) => setReason(event.target.value)} aria-label={t("reportReason")} placeholder={t("reportReason")} maxLength={1000} disabled={pending} />}
        {forwardDraft?.replayTarget && activeDialog === "forward" && <div role="alert" className="space-y-2 text-body-xs"><p className="text-body-xs">{t("sendError_replay_unverified")}</p><Button asChild variant="outline" size="sm"><a href={discussionMessageHref(forwardDraft.replayTarget)} target="_blank" rel="noopener noreferrer">{t("inspectPrevious")}</a></Button></div>}
        {(forwardDraft?.status === "unknown" && activeDialog === "forward" || error) && <p role="alert" className="text-body-xs text-destructive">{t(forwardDraft?.status === "unknown" && activeDialog === "forward" ? (forwardDraft.error === "resolved" ? "forwardResolvedUnknown" : "sendError_unknown") : error)}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending || forwardDraft?.status === "sending"} onClick={() => { if (activeDialog === "forward") updateForwardDraft(() => undefined); else setDialog(null); setError(""); }}>{t(activeDialog === "forward" && forwardLocked ? "discardPending" : "cancel")}</Button><Button type="button" variant={activeDialog === "delete" ? "destructive" : "default"} isLoading={pending || forwardDraft?.status === "sending"} disabled={forwardDraft?.status === "sending" || forwardDraft?.status === "replay_unverified" || (activeDialog === "edit" && editingRevision !== message.revision) || (activeDialog === "forward" && (!targetChannel || !targetQuestion)) || (activeDialog === "report" && !reason.trim())} onClick={() => void submitDialog()}>{activeDialog === "delete" ? t("delete") : activeDialog === "forward" ? t("forward") : activeDialog === "report" ? t("sendReport") : t("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
