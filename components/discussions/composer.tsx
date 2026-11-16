"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { AlertCircle, AtSign, Bold, Check, CircleHelp, Code2, ImageOff, ImagePlus, Italic, Link2, List, Loader2, MoreHorizontal, RotateCcw, Send, Sigma, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ZyraComposerInput, type ZyraComposerInputHandle } from "@/components/course/zyra-composer-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DiscussionReplayTarget, DiscussionSendError, DiscussionSendFailure } from "@/lib/discussions/contracts";
import { validDiscussionId } from "@/lib/discussions/policy";
import { discussionMessageHref } from "./discussion-adapter";
import { DiscussionMarkdown } from "./discussion-markdown";
import type { DiscussionAttachment, DiscussionMention, DiscussionPerson, DiscussionPrivateKind, DiscussionUploadError, DiscussionWorkspaceProps } from "./view-model";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ComposerImage = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  attachment?: DiscussionAttachment;
  error?: DiscussionUploadError;
};

export type ComposerDraft = {
  body: string;
  images: ComposerImage[];
  mentionedPeople: Array<DiscussionMention & { channelId: string }>;
  replyTo?: { id: string; authorName: string; excerpt: string; imageOnly?: boolean };
  sending: boolean;
  error: DiscussionSendError | null;
  requestId?: string;
  requestFingerprint?: string;
  pendingSubmission?: ComposerSubmission;
  replayTarget?: DiscussionReplayTarget;
};

export type ComposerSubmission = {
  viewerId: string; channelId: string; questionId?: string;
  questionDetails?: { title: string; helpKind?: DiscussionPrivateKind };
  body: string; attachments: DiscussionAttachment[]; mentionIds: string[]; askZyra: boolean;
  skinId?: string | null; requestId: string; replyToMessageId?: string;
};

export const emptyComposerDraft = (): ComposerDraft => ({ body: "", images: [], mentionedPeople: [], sending: false, error: null });

export function setComposerReplyTarget(draft: ComposerDraft, replyTo?: ComposerDraft["replyTo"]): ComposerDraft {
  return draft.sending || draft.error === "unknown" || draft.error === "replay_unverified" ? draft : { ...draft, replyTo, requestId: undefined };
}

type ComposerProps = {
  draft: ComposerDraft;
  update: (change: (draft: ComposerDraft) => ComposerDraft) => void;
  channelId: string;
  questionId?: string;
  zyraUnscoped?: boolean;
  audienceHelp?: string;
  viewer: DiscussionPerson;
  onSearchMentions: DiscussionWorkspaceProps["onSearchMentions"];
  onUpload: DiscussionWorkspaceProps["onUploadImage"];
  onSubmit: (input: ComposerSubmission) => Promise<DiscussionSendFailure | void>;
  questionDetails?: ComposerSubmission["questionDetails"];
  onSuccess?: () => void;
  disabled?: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  beforeContent?: ReactNode;
};

function ToolButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void; disabled: boolean }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}><Icon className="size-4" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function mentionHandle(person: DiscussionMention) {
  return person.mention.toLowerCase();
}

function sameMentionNameAndRole(a: DiscussionMention, b: DiscussionMention) {
  return a.id !== b.id && a.role === b.role && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

export function ambiguousDiscussionMention(person: DiscussionMention, people: DiscussionMention[]) {
  const context = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return !!person.ambiguous || people.some(other => sameMentionNameAndRole(person, other) && context(person.context) === context(other.context));
}

export function discussionMentionAmbiguityKey(person: DiscussionMention, people: DiscussionMention[]) {
  if (!ambiguousDiscussionMention(person, people)) return null;
  const context = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return person.hasNamesake && person.ambiguous || people.some(other => sameMentionNameAndRole(person, other) && context(person.context) === context(other.context))
    ? "mentionIdentityUnavailable" : "mentionAmbiguous";
}

export function selectDiscussionMention(person: DiscussionMention, people: DiscussionMention[]): DiscussionMention {
  const existing = people.find(item => item.id === person.id);
  if (existing) return { ...person, mention: existing.mention };
  const used = new Set(people.map(item => item.mention.toLowerCase()));
  let handle = person.mention;
  for (let suffix = 2; used.has(handle.toLowerCase()); suffix++) handle = `${person.mention}_${suffix}`;
  return { ...person, mention: handle };
}

export function discussionMentions(body: string, people: DiscussionMention[]) {
  const handles = new Set(Array.from(body.matchAll(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu), (match) => match[1].toLowerCase()));
  const eligible = people.filter(person => people.every(other => other.id === person.id || mentionHandle(other) !== mentionHandle(person)));
  return { mentionIds: [...new Set(eligible.filter((person) => mentionHandle(person) !== "zyra" && handles.has(mentionHandle(person))).map((person) => person.id))], askZyra: handles.has("zyra") };
}

export function discussionSendErrorKey(reason: unknown) {
  return `sendError_${safeSendError(reason)}` as const;
}

export function discussionUploadErrorKey(reason: unknown) {
  switch (reason) {
    case "pixels": case "size": case "format": case "rate_limited": case "login": case "access": case "expired": return `uploadError_${reason}` as const;
    default: return "uploadError_unknown";
  }
}

function safeSendError(reason: unknown): DiscussionSendError {
  switch (reason) {
    case "unavailable": case "invalid": case "rate_limited": case "conflict": case "resolved": case "attachment_expired": return reason;
    default: return "unknown";
  }
}

export function failedComposerDraft(draft: ComposerDraft, reason: unknown, wasUncertain = false): ComposerDraft {
  if (reason && typeof reason === "object" && "error" in reason && reason.error === "replay_unverified" && "target" in reason
    && reason.target && typeof reason.target === "object" && "threadId" in reason.target && "messageId" in reason.target
    && validDiscussionId(reason.target.threadId) && validDiscussionId(reason.target.messageId) && draft.pendingSubmission) {
    return { ...draft, sending: false, error: "replay_unverified", replayTarget: { threadId: reason.target.threadId, messageId: reason.target.messageId } };
  }
  const error = safeSendError(reason);
  if (error === "resolved" && wasUncertain) return { ...draft, sending: false, error, requestId: undefined, requestFingerprint: undefined, pendingSubmission: undefined };
  if (error === "attachment_expired") return { ...draft, sending: false, error, requestId: undefined, requestFingerprint: undefined, pendingSubmission: undefined,
    images: draft.images.map(image => ({ ...image, status: "error", error: "expired", attachment: undefined })) };
  if (error === "unknown" || wasUncertain) return { ...draft, sending: false, error: "unknown" };
  return { ...draft, sending: false, error, pendingSubmission: undefined };
}

export function prepareComposerSubmission(draft: ComposerDraft, viewer: DiscussionPerson, channelId: string, questionId?: string, questionDetails?: ComposerSubmission["questionDetails"]) {
  if (draft.error === "replay_unverified") return null;
  if (draft.error === "unknown") {
    const submission = draft.pendingSubmission;
    return submission && submission.viewerId === viewer.id && submission.channelId === channelId && submission.questionId === questionId
      ? { submission, fingerprint: draft.requestFingerprint ?? "" } : null;
  }
  const attachments = draft.images.flatMap(image => image.attachment ? [image.attachment] : []);
  const mentions = discussionMentions(draft.body, draft.mentionedPeople);
  const fingerprint = JSON.stringify([viewer.id, viewer.skinId, channelId, questionId, questionDetails, draft.body.trim(), attachments.map(item => item.id), mentions, draft.replyTo?.id]);
  const requestId = draft.requestFingerprint === fingerprint && draft.requestId ? draft.requestId : crypto.randomUUID();
  return { fingerprint, submission: { viewerId: viewer.id, channelId, questionId, questionDetails, body: draft.body.trim(), attachments,
    ...mentions, skinId: viewer.skinId, requestId, replyToMessageId: draft.replyTo?.id } };
}

export async function deliverComposerSubmission(prepared: { submission: ComposerSubmission; fingerprint: string }, wasUncertain: boolean,
  update: ComposerProps["update"], onSubmit: ComposerProps["onSubmit"]) {
  update(current => ({ ...current, sending: true, error: null, requestId: prepared.submission.requestId, requestFingerprint: prepared.fingerprint, pendingSubmission: prepared.submission }));
  try {
    const failure = await onSubmit(prepared.submission);
    if (failure !== undefined) { update(current => failedComposerDraft(current, failure, wasUncertain)); return false; }
    update(() => emptyComposerDraft());
    return true;
  } catch {
    update(current => failedComposerDraft(current, "unknown", wasUncertain));
    return false;
  }
}

export function DiscussionComposer({ draft, update, channelId, questionId, zyraUnscoped, audienceHelp, viewer, onSearchMentions, onUpload, onSubmit, onSuccess, disabled = false, submitDisabled = false, submitLabel, beforeContent, questionDetails }: ComposerProps) {
  const t = useTranslations("discussions");
  const textRef = useRef<ZyraComposerInputHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(new Set<string>());
  const uploadsInFlight = useRef(new Set<string>());
  const [fileError, setFileError] = useState<"" | "maxImages" | "fileRequirements">("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionRetry, setMentionRetry] = useState(0);
  const [mentionPage, setMentionPage] = useState(0);
  const [mentionResult, setMentionResult] = useState<{ key: string; status: "loading" | "ready" | "error"; items: DiscussionMention[] }>({ key: "", status: "ready", items: [] });
  const searchMentions = useRef(onSearchMentions);
  searchMentions.current = onSearchMentions;
  const mentionKey = JSON.stringify([channelId, questionId, mentionSearch.trim()]);
  useEffect(() => {
    const query = mentionSearch.trim();
    if (!mentionOpen || !channelId || query.length < 2) return;
    let cancelled = false;
    setMentionPage(0);
    setMentionResult({ key: mentionKey, status: "loading", items: [] });
    const timer = setTimeout(() => {
      void searchMentions.current({ channelId, questionId, query }).then((items) => {
        if (!cancelled) setMentionResult({ key: mentionKey, status: "ready", items: items.slice(0, 100) });
      }).catch(() => { if (!cancelled) setMentionResult({ key: mentionKey, status: "error", items: [] }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [channelId, questionId, mentionOpen, mentionSearch, mentionKey, mentionRetry]);
  const busy = disabled || draft.sending;
  const uncertain = draft.error === "unknown";
  const replayUnverified = draft.error === "replay_unverified";
  const editingDisabled = busy || uncertain || replayUnverified;
  const canReplay = uncertain && draft.pendingSubmission?.viewerId === viewer.id && draft.pendingSubmission.channelId === channelId && draft.pendingSubmission.questionId === questionId;
  const uploading = draft.images.some((image) => image.status === "uploading");
  const failedImage = draft.images.some((image) => image.status === "error");
  const mentions = discussionMentions(draft.body, draft.mentionedPeople);
  const staleMentions = draft.mentionedPeople.some((person) => person.channelId !== channelId && mentions.mentionIds.includes(person.id));
  const invalidContent = draft.body.length > 12_000 || draft.body.includes("\0") || mentions.mentionIds.length > 10 || staleMentions;

  function insert(before: string, after = "", person?: DiscussionMention) {
    if (person) { person = selectDiscussionMention(person, draft.mentionedPeople); before = `@${person.mention} `; }
    const textarea = textRef.current;
    const start = textarea?.selectionStart ?? draft.body.length;
    const end = textarea?.selectionEnd ?? start;
    if (person) update(current => ({ ...current, mentionedPeople: [...current.mentionedPeople.filter(item => item.id !== person.id), { ...person, channelId }] }));
    textarea?.insertText(before + draft.body.slice(start, end) + after);
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(start + before.length, end + before.length);
    });
  }

  async function upload(image: ComposerImage) {
    if (uploadsInFlight.current.has(image.id)) return;
    uploadsInFlight.current.add(image.id);
    update((current) => ({ ...current, images: current.images.map((item) => item.id === image.id ? { ...item, status: "uploading", error: undefined } : item) }));
    try {
      const result = await onUpload({ file: image.file, channelId, questionId });
      update((current) => ({ ...current, images: current.images.map((item) => item.id === image.id ? result.ok ? { ...item, status: "ready", attachment: result.attachment } : { ...item, status: "error", error: result.error } : item) }));
    } catch {
      update((current) => ({ ...current, images: current.images.map((item) => item.id === image.id ? { ...item, status: "error", error: "unknown" } : item) }));
    } finally {
      uploadsInFlight.current.delete(image.id);
    }
  }

  function pickImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length + draft.images.length > MAX_IMAGES) {
      setFileError("maxImages");
      return;
    }
    if (files.some((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES || file.size === 0)) {
      setFileError("fileRequirements");
      return;
    }
    setFileError("");
    const images: ComposerImage[] = files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "uploading" }));
    update((current) => ({ ...current, images: [...current.images, ...images], requestId: undefined }));
    images.forEach((image) => { void upload(image); });
  }

  function removeImage(image: ComposerImage) {
    URL.revokeObjectURL(image.previewUrl);
    update((current) => ({ ...current, images: current.images.filter((item) => item.id !== image.id), requestId: undefined }));
  }

  async function submit() {
    const lane = questionId ?? `new:${channelId}`;
    if (inFlight.current.has(lane) || busy || submitDisabled || replayUnverified || (uncertain ? !canReplay : uploading || failedImage || invalidContent || (!draft.body.trim() && draft.images.length === 0))) return;
    const prepared = prepareComposerSubmission(draft, viewer, channelId, questionId, questionDetails);
    if (!prepared) return;
    inFlight.current.add(lane);
    try {
      if (await deliverComposerSubmission(prepared, uncertain, update, onSubmit)) {
        draft.images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        onSuccess?.();
      }
    } finally {
      inFlight.current.delete(lane);
    }
  }

  return <div className="flex min-h-0 min-w-0 flex-col" data-discussion-composer>
    <div role="region" tabIndex={0} aria-label={t("editorRegion")} className="min-h-0 space-y-2 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring">
    {beforeContent}
    {draft.replyTo && <div data-discussion-reply-target className="flex min-w-0 items-center gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1 text-body-xs"><div className="flex min-w-0 flex-1 items-center gap-1.5"><span className="min-w-0 shrink break-words font-semibold">{t("replyingTo", { name: draft.replyTo.authorName })}</span><div className="line-clamp-1 min-w-0 flex-1 break-words text-muted-foreground [&_div]:text-body-xs [&_p]:text-body-xs"><DiscussionMarkdown content={draft.replyTo.imageOnly ? t("image") : draft.replyTo.excerpt.slice(0, 600)} /></div></div><Button type="button" variant="ghost" size="icon-sm" aria-label={t("cancelReply")} disabled={editingDisabled} onClick={() => update((current) => setComposerReplyTarget(current))}><X /></Button></div>}
      <div data-discussion-toolbar className="flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap items-center">
          <DropdownMenu><Tooltip disableHoverableContent><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("formatting")} disabled={editingDisabled}><MoreHorizontal /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t("formatting")}</TooltipContent></Tooltip><DropdownMenuContent collisionPadding={16} onCloseAutoFocus={(event) => { if (textRef.current) { event.preventDefault(); textRef.current.focus(); } }}>
            <DropdownMenuItem onSelect={() => insert("**", "**")}><Bold />{t("bold")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => insert("*", "*")}><Italic />{t("italic")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => insert("\n- ")}><List />{t("list")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => insert("`", "`")}><Code2 />{t("code")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => insert("[", "](https://)")}><Link2 />{t("link")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => insert("$", "$")}><Sigma />{t("formula")}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
          <Popover open={mentionOpen} onOpenChange={setMentionOpen}><Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("mentionPerson")} disabled={editingDisabled}><AtSign /></Button></PopoverTrigger></TooltipTrigger><TooltipContent>{t("mentionPerson")}</TooltipContent></Tooltip><PopoverContent aria-label={t("mentionPerson")} align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)] space-y-2 p-2">
            <Button type="button" variant="ghost" className="w-full [&>span]:justify-start" onClick={() => { insert("@Zyra "); setMentionOpen(false); }}>@Zyra</Button>
            <Input value={mentionSearch} onChange={(event) => { setMentionSearch(event.target.value.slice(0, 80)); setMentionPage(0); }} aria-label={t("searchPeople")} placeholder={t("searchPeoplePlaceholder")} />
            {mentionSearch.trim().length < 2 ? <p className="px-2 text-body-xs text-muted-foreground">{t("enterTwoCharacters")}</p> : mentionResult.key !== mentionKey || mentionResult.status === "loading" ? <p role="status" className="px-2 text-body-xs text-muted-foreground">{t("searchingPeople")}</p> : mentionResult.status === "error" ? <div role="alert" className="space-y-1 px-2 text-body-xs text-destructive"><p className="text-body-xs">{t("peopleSearchError")}</p><Button type="button" variant="outline" size="sm" onClick={() => setMentionRetry((value) => value + 1)}>{t("retry")}</Button></div> : mentionResult.items.length === 0 ? <p className="px-2 text-body-xs text-muted-foreground">{t("noPeople")}</p> : <div className="max-h-48 overflow-y-auto">{mentionResult.items.slice(mentionPage * 10, mentionPage * 10 + 10).map((person) => {
              const needsContext = person.hasNamesake || mentionResult.items.some(other => sameMentionNameAndRole(person, other));
              const ambiguous = ambiguousDiscussionMention(person, mentionResult.items);
              return <Button key={person.id} type="button" variant="ghost" disabled={editingDisabled || ambiguous} className="h-auto w-full whitespace-normal py-1 text-left [&>span]:justify-start" onClick={() => { insert(`@${person.mention} `, "", person); setMentionOpen(false); }}><span className="min-w-0 break-words">{person.name}, {t(person.role === "student" ? "role_student" : person.role === "tutor" ? "role_tutor" : person.role === "admin" ? "role_admin" : "role_unknown")}{needsContext && `, ${person.context?.trim() || t("mentionNoContext")}`}{ambiguous && `, ${t(discussionMentionAmbiguityKey(person, mentionResult.items)!)}`}</span></Button>;
            })}</div>}
            {mentionResult.status === "ready" && mentionResult.key === mentionKey && mentionResult.items.length > 10 && <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={mentionPage === 0} onClick={() => setMentionPage(page => page - 1)}>{t("previous")}</Button><span className="text-body-xs">{t("page", { page: mentionPage + 1 })}</span><Button type="button" variant="outline" size="sm" disabled={(mentionPage + 1) * 10 >= mentionResult.items.length} onClick={() => setMentionPage(page => page + 1)}>{t("next")}</Button></div>}
          </PopoverContent></Popover>
          <Popover><Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("composerHelp")}><CircleHelp /></Button></PopoverTrigger></TooltipTrigger><TooltipContent>{t("composerHelp")}</TooltipContent></Tooltip><PopoverContent aria-label={t("composerHelp")} align="end" collisionPadding={16} className="max-h-[min(24rem,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto text-body-xs">
            {audienceHelp && <p>{audienceHelp}</p>}
            <p>{t("zyraContext")}</p>
            {zyraUnscoped !== undefined && <p>{t(viewer.role === "student" ? zyraUnscoped ? "zyraUnscopedFreeText" : "zyraFreeText" : "zyraImages")}</p>}
            {viewer.role === "student" && <p>{t("zyraQuota")}</p>}
          </PopoverContent></Popover>
          <ToolButton label={t("addImage")} icon={ImagePlus} disabled={editingDisabled || draft.images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={editingDisabled} multiple className="sr-only" tabIndex={-1} onChange={pickImages} />
        </div>
      </div>
    {draft.images.length > 0 && <div data-discussion-images className="flex gap-2 overflow-x-auto py-1">{draft.images.map(image => <div key={image.id} className="relative size-16 shrink-0 rounded-md border border-border bg-muted">
      <img src={image.previewUrl} alt={t("imagePreview", { name: image.file.name })} className="size-full rounded-md object-cover" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.display = "flex"; }} /><span style={{ display: "none" }} role="status" aria-label={t("imageDisplayError")} className="absolute inset-0 items-center justify-center text-muted-foreground"><ImageOff className="size-4" /></span>
      <span role="status" aria-label={`${image.file.name}: ${t(image.status === "error" ? "uploadFailed" : image.status === "uploading" ? "uploading" : "ready")}`} className="absolute bottom-0 left-0 rounded-md bg-background p-1">{image.status === "error" ? <AlertCircle className="size-4 text-destructive" /> : image.status === "uploading" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}</span>
      <Tooltip><TooltipTrigger asChild><Button type="button" variant="secondary" size="icon-sm" className="absolute right-0 top-0" aria-label={t("removeFile", { name: image.file.name })} disabled={editingDisabled} onClick={() => removeImage(image)}><X /></Button></TooltipTrigger><TooltipContent>{t("removeFile", { name: image.file.name })}</TooltipContent></Tooltip>
    </div>)}</div>}
    {draft.images.filter(image => image.status === "error").map(image => <div key={image.id} role="alert" className="flex items-center gap-2 text-body-xs text-destructive"><span className="min-w-0 break-words">{image.file.name}: {t(discussionUploadErrorKey(image.error))}</span><Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon-sm" disabled={editingDisabled} aria-label={t("retryFile", { name: image.file.name })} onClick={() => void upload(image)}><RotateCcw /></Button></TooltipTrigger><TooltipContent>{t("retryFile", { name: image.file.name })}</TooltipContent></Tooltip></div>)}
    <ZyraComposerInput ref={textRef} value={draft.body} onChange={(body) => update((current) => ({ ...current, body, mentionedPeople: current.mentionedPeople.filter((person) => discussionMentions(body, [person]).mentionIds.length > 0), error: submitDisabled && current.error === "resolved" ? current.error : null, requestId: undefined }))} onSubmit={() => void submit()} submitOnEnter={false} renderFormatting maxLength={12_000} disabled={editingDisabled} placeholder={t("writeMessage")} aria-label={t("writeMessage")} className="rounded-md border border-input bg-background px-2 text-body-sm focus-within:ring-2 focus-within:ring-ring" />
    {fileError && <p role="alert" className="text-body-xs text-destructive">{fileError === "maxImages" ? t("maxImages", { count: MAX_IMAGES }) : t("fileRequirements")}</p>}
    {invalidContent && !staleMentions && <p role="alert" className="text-body-xs text-destructive">{t("contentLimit")}</p>}
    {draft.error && !replayUnverified && !(draft.error === "attachment_expired" && draft.images.some(image => image.error === "expired")) && (draft.error !== "resolved" || submitDisabled) && <p role="alert" className="text-body-xs text-destructive">{t(discussionSendErrorKey(draft.error))}</p>}
    </div>
    <div className="shrink-0 space-y-2 pt-2">
      {staleMentions && <p role="alert" className="text-body-xs text-destructive">{t("staleMentions")}</p>}
      {replayUnverified && draft.replayTarget ? <div role="alert" className="space-y-2 text-body-xs"><p className="text-body-xs">{t("sendError_replay_unverified")}</p><div className="flex flex-wrap gap-2"><Button asChild type="button" variant="outline" size="sm"><a href={discussionMessageHref(draft.replayTarget)} target="_blank" rel="noopener noreferrer">{t("inspectPrevious")}</a></Button><Button type="button" variant="outline" size="sm" onClick={() => { draft.images.forEach(image => URL.revokeObjectURL(image.previewUrl)); update(() => emptyComposerDraft()); }}>{t("discardPending")}</Button></div></div> : <div className="flex flex-wrap justify-end gap-2">{(uncertain || draft.error === "resolved" && submitDisabled) && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { draft.images.forEach(image => URL.revokeObjectURL(image.previewUrl)); update(() => emptyComposerDraft()); }}>{t(uncertain ? "discardPending" : "discardDraft")}</Button>}<Button type="button" onClick={() => void submit()} isLoading={draft.sending} disabled={busy || submitDisabled || replayUnverified || (uncertain ? !canReplay : uploading || failedImage || invalidContent || (!draft.body.trim() && draft.images.length === 0))}><Send />{draft.sending ? t("sending") : uploading ? t("uploadingImages") : draft.error ? t("retrySend") : submitLabel}</Button></div>}
    </div>
  </div>;
}
