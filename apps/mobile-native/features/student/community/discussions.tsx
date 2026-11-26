import { DISCUSSION_REACTIONS } from "../../../../../lib/discussions/policy";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { AppState, Image, View } from "react-native";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useVisibleDiscussionRead } from "../../discussions/read-viewport";
import { SharedUiComposer, type SharedUiAction } from "../../shared-ui";
import { discussionAiMessage, listRefreshDelay, threadRefreshDelay } from "./discussion-refresh";
import { DiscussionMessageBody } from "./discussion-markdown";
import { DISCUSSION_DRAFT_KEY } from "../assessment-draft-store";
import {
  changeDiscussionDraft, discussionDraftScope, discussionSubmission, emptyDiscussionDraft, readDiscussionDraft,
  type DiscussionDraft, type DraftContext,
} from "./discussion-drafts";
import type {
  DiscussionAttachment, DiscussionAuthorProfile, DiscussionChannelMetadata, DiscussionMention, DiscussionMessage, DiscussionPage,
  DiscussionSendResult, DiscussionThread, DiscussionThreadStatus,
} from "../../../../../lib/discussions/contracts";
import {
  Action, Actions, Choices, Copy, Field, Notice, Page, Remote, Row, Rows, Toggle, communityPath,
  dateLabel, describeError, operationResult, post, readJson, styles, useCommunity, useOperation, useRemote,
} from "./ui";

type Scope = { catalog: DiscussionPage<DiscussionChannelMetadata>; courseId: string | null; skinId: string | null };
type ThreadDetail = {
  thread: DiscussionThread; messages: DiscussionPage<DiscussionMessage> & { observationReceipt: string; previousCursor?: string };
  readThroughSeq: number; aiStatuses: { messageId: string; status: string; reason: string | null }[];
};

function workspace(view: string, query: Record<string, string | undefined> = {}, channelIds: string[] = []) {
  const params = new URLSearchParams({ view });
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined) params.set(key, value); });
  channelIds.forEach(channel => params.append("channelId", channel));
  return `/api/discussions/workspace?${params}`;
}

function useDiscussionNavigation() {
  const { route, navigate, replace } = useCommunity();
  const base = route.path.split("?")[0];
  return (values: Record<string, string | undefined>, replacePage = false) => {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    const search = query.toString();
    (replacePage ? replace : navigate)(`${base}${search ? `?${search}` : ""}`);
  };
}

function Composer({ context, channelId, skinId, onSent }: {
  context: DraftContext; channelId: string; skinId: string | null; onSent(target: { threadId: string; messageId: string }): void;
}) {
  const { request, tr, session, theme, pickAssessmentFile, drafts, focused = true } = useCommunity();
  const scope = discussionDraftScope(context, channelId, skinId);
  const durable = Boolean(drafts?.update);
  const [draft, renderDraft] = useState(emptyDiscussionDraft);
  const current = useRef(draft);
  const [loading, setLoading] = useState(durable);
  const [storageError, setStorageError] = useState(false);
  const [loaded, setLoaded] = useState(!durable);
  const [loadVersion, setLoadVersion] = useState(0);
  const alive = useRef(false);
  const isFocused = useRef(focused);
  isFocused.current = focused;
  const selection = useRef({ start: 0, end: 0 });
  const [requestedSelection, setRequestedSelection] = useState<{ start: number; end: number }>();
  const [mentionResults, setMentionResults] = useState<DiscussionMention[]>([]);
  const [search, setSearch] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const action = useOperation();

  const showDraft = useCallback((next: DiscussionDraft | null) => {
    if (!alive.current) return;
    current.current = next ?? emptyDiscussionDraft();
    renderDraft(current.current);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!drafts?.update) return;
    let active = true;
    setLoading(true);
    setStorageError(false);
    void drafts.get(DISCUSSION_DRAFT_KEY).then(raw => {
      if (!active) return;
      showDraft(readDiscussionDraft(raw, scope));
      setLoaded(true);
    }, () => {
      if (active) setStorageError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [drafts, scope, showDraft, loadVersion]);

  const save = async (next: DiscussionDraft | null, expected?: DiscussionDraft) => {
    if (!drafts?.update) return true;
    let applied = false;
    let saved: DiscussionDraft | null = null;
    try {
      await drafts.update(DISCUSSION_DRAFT_KEY, raw => {
        const change = changeDiscussionDraft(raw, scope, expected, next);
        applied = change.applied;
        saved = change.current;
        return change.value;
      });
      if (alive.current) setStorageError(false);
      if (!applied) showDraft(saved);
      return applied;
    } catch {
      if (alive.current) setStorageError(true);
      return false;
    }
  };

  const edit = (change: (previous: DiscussionDraft) => DiscussionDraft) => {
    if (!alive.current || !isFocused.current || !loaded || lock.current || current.current.pendingId) return;
    const next = change(current.current);
    showDraft(next);
    void save(next);
  };

  const { body, title, askZyra, attachments, mentions, pendingId, error, replayTarget } = draft;
  const [expiryTick, setExpiryTick] = useState(0);
  const clock = Date.now();
  useEffect(() => {
    if (!focused) return;
    const now = Date.now();
    const nextExpiry = Math.min(...attachments.map(image => image.expiresAt).filter(at => at > now));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setExpiryTick(value => value + 1), Math.min(nextExpiry - now + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [attachments, focused, expiryTick]);
  const expired = attachments.some(image => image.expiresAt <= clock);

  const submit = async () => {
    const previous = current.current;
    if (lock.current || action.pending || !loaded || !isFocused.current || previous.replayTarget
      || (!previous.pendingId && previous.attachments.some(image => image.expiresAt <= Date.now()))) return;
    lock.current = true;
    setSending(true);
    const pending = { ...previous, pendingId: previous.pendingId ?? randomUUID(), error: "unknown" as const };
    try {
      // Ensure the retry identity and frozen payload survive before sending.
      if (!await save(pending, previous)) return;
      showDraft(pending);
      if (!alive.current || !isFocused.current) return;
      let result: DiscussionSendResult;
      try {
        result = await post<DiscussionSendResult>(request, "discussion",
          discussionSubmission(pending, context, skinId, pending.pendingId));
      } catch {
        return; // The already saved state records unconfirmed delivery.
      }
      if (result.ok) {
        if (await save(null, pending)) {
          showDraft(null);
          if (alive.current && isFocused.current) onSent(result.value);
        }
      } else if (result.error !== "unknown") {
        const next: DiscussionDraft = result.error === "replay_unverified"
          ? { ...pending, error: result.error, replayTarget: result.value }
          : {
            ...pending, pendingId: undefined, error: result.error,
            attachments: result.error === "attachment_expired"
              ? pending.attachments.map(image => ({ ...image, expiresAt: 0 })) : pending.attachments,
          };
        if (await save(next, pending)) showDraft(next);
      }
    } finally {
      lock.current = false;
      if (alive.current) setSending(false);
    }
  };

  const discard = async (open: boolean) => {
    if (lock.current || !isFocused.current) return;
    lock.current = true;
    setSending(true);
    const previous = current.current;
    try {
      if (await save(null, previous)) {
        showDraft(null);
        if (open && previous.replayTarget && alive.current && isFocused.current) onSent(previous.replayTarget);
      }
    } finally {
      lock.current = false;
      if (alive.current) setSending(false);
    }
  };

  const upload = () => void action.run(async () => {
    const selected = await pickAssessmentFile?.();
    if (!selected || !alive.current || !isFocused.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || (selected.size ?? 0) > 8 * 1024 * 1024) {
      throw new Error("Invalid image");
    }
    const form = new FormData();
    form.append("channelId", channelId);
    form.append("file", selected as unknown as Blob);
    const started = Date.now();
    const item = await readJson<{ id: string; name?: string; expiresAt?: string }>(request, "/api/discussions/attachments",
      { method: "POST", headers: { Origin: new URL(session.origin).origin }, body: form });
    const expiresAt = Date.parse(item.expiresAt ?? "");
    edit(previous => ({ ...previous, error: undefined, attachments: [...previous.attachments, {
      id: item.id, name: (item.name || selected.name).slice(0, 512),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : started + 24 * 60 * 60 * 1000,
    }] }));
  }, undefined, tr("Unggah gambar belum berhasil. Gunakan JPEG, PNG, atau WebP hingga 8 MiB.", "Image upload failed. Use JPEG, PNG, or WebP up to 8 MiB."));

  const lookup = () => void action.run(async () => {
    setMentionResults(await post<DiscussionMention[]>(request, "discussion", context.action === "create"
      ? { action: "channel-mentions", channelId, search: search.trim() }
      : { action: "mentions", threadId: context.threadId, search: search.trim() }));
  });
  const labels = {
    unavailable: tr("Akses diskusi berubah.", "Discussion access has changed."),
    invalid: tr("Periksa isi dan pilihan Anda.", "Check your message and selections."),
    rate_limited: tr("Terlalu banyak permintaan. Coba lagi nanti.", "Too many requests. Try again later."),
    conflict: tr("Percobaan ini bertentangan dengan kiriman sebelumnya.", "This request conflicts with an earlier submission."),
    resolved: tr("Diskusi sudah selesai.", "The discussion is resolved."),
    attachment_expired: tr("Lampiran kedaluwarsa. Lepas lalu unggah kembali.", "An attachment expired. Remove it and upload it again."),
    unknown: tr("Pengiriman belum terkonfirmasi. Coba kirim ulang dengan identitas yang sama.", "Delivery is unconfirmed. Retry this submission with the same request ID."),
    replay_unverified: tr("Status kiriman belum dapat diperiksa. Buka diskusi untuk memeriksanya.", "The submission could not be verified. Open the discussion to check it."),
  };
  const locked = !loaded || Boolean(pendingId) || sending || !focused;
  const notice = error ? labels[error] : expired ? labels.attachment_expired : undefined;
  const tools: SharedUiAction<"attach" | "mention">[] = [
    { id: "mention", label: tr("Sebut peserta", "Mention someone") },
  ];
  if (pickAssessmentFile) tools.unshift({
    id: "attach", label: tr("Lampirkan gambar", "Attach image"), disabled: action.pending || attachments.length >= 4,
  });
  if (loading) return <Copy kind="muted">{tr("Memuat draf", "Loading draft")}</Copy>;
  return <View style={styles.block}>
    {storageError && <>
      <Notice notice={{ message: tr("Draf belum dapat disimpan atau dimuat.", "The draft could not be saved or loaded."), failed: true }} />
      <Actions><Action label={tr("Coba lagi", "Try again")} onPress={() => {
        if (loaded) void save(current.current, current.current);
        else setLoadVersion(value => value + 1);
      }} /></Actions>
    </>}
    {context.action === "create" && <Field label={tr("Judul pertanyaan (opsional)", "Question title (optional)")} value={title} onChangeText={value => edit(previous => ({ ...previous, title: value, error: undefined }))} maxLength={160} editable={!locked} />}
    <SharedUiComposer
      testID={context.action === "answer" ? "student-discussion-answer" : "student-discussion-composer"}
      theme={theme}
      label={context.action === "create" ? tr("Pertanyaan", "Question") : context.action === "answer" ? tr("Jawaban", "Answer") : tr("Balasan", "Reply")}
      draft={body}
      onDraftChange={value => {
        setRequestedSelection(undefined);
        edit(previous => ({ ...previous, body: value, error: undefined,
          mentions: previous.mentions.filter(item => value.includes(`@${item.handle}`)) }));
      }}
      selection={requestedSelection}
      onSelectionChange={value => {
        selection.current = value;
        if (requestedSelection?.start === value.start && requestedSelection.end === value.end) setRequestedSelection(undefined);
      }}
      maxLength={12000}
      canSubmitEmpty={attachments.length > 0}
      pending={sending}
      editingDisabled={locked}
      submitDisabled={!loaded || !focused || action.pending || Boolean(replayTarget) || (expired && !pendingId)}
      submitLabel={context.action === "create" ? tr("Kirim pertanyaan", "Send question") : context.action === "answer" ? tr("Kirim jawaban", "Send answer") : tr("Kirim balasan", "Send reply")}
      onSubmit={() => void submit()}
      tools={tools}
      onTool={tool => tool === "attach" ? upload() : setMentionOpen(value => !value)}
      recovery={notice ? {
        message: notice,
        retry: pendingId && !replayTarget ? { label: tr("Coba kirim ulang", "Retry submission"), onRetry: () => void submit() } : undefined,
      } : undefined}
      beforeInput={attachments.length ? <Rows>{attachments.map(image => <Row key={image.id} title={image.name} meta={image.expiresAt <= clock ? tr("Kedaluwarsa", "Expired") : undefined}>
        <Actions><Action label={tr("Lepas gambar", "Remove image")} disabled={locked} onPress={() =>
          edit(previous => ({ ...previous, error: undefined, attachments: previous.attachments.filter(item => item.id !== image.id) }))} /></Actions>
      </Row>)}</Rows> : undefined}
    />
    <Toggle label={tr("Tanya Zyra", "Ask Zyra")} value={askZyra} onChange={value => edit(previous => ({ ...previous, askZyra: value, error: undefined }))} disabled={locked} />
    {mentionOpen && <>
      <Field label={tr("Nama peserta", "Participant name")} value={search} onChangeText={setSearch} maxLength={80} editable={!locked} />
      <Actions><Action label={tr("Cari peserta", "Find participant")} busy={action.pending} disabled={locked || !search.trim()} onPress={lookup} /></Actions>
      {mentionResults.map(item => <Row key={item.id} title={item.name} meta={item.context ?? undefined} onPress={locked ? undefined : () => {
        let handle = item.name.normalize("NFKD").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 60) || "anggota";
        if (handle.toLowerCase() === "zyra" || mentions.some(value => value.handle.toLowerCase() === handle.toLowerCase())) handle = `${handle}_${mentions.length}`;
        const { start, end } = selection.current;
        const insert = ` @${handle} `;
        const nextBody = body.slice(0, start) + insert + body.slice(end);
        if (mentions.length >= 10 || nextBody.length > 12000 || mentions.some(value => value.id === item.id)) return;
        edit(previous => ({ ...previous, body: nextBody, error: undefined,
          mentions: [...previous.mentions.filter(value => nextBody.includes(`@${value.handle}`)), { id: item.id, handle }] }));
        setRequestedSelection({ start: start + insert.length, end: start + insert.length });
        setMentionOpen(false);
      }} />)}
    </>}
    <Notice notice={action.notice} />
    {pendingId && !sending && <Actions>
      {replayTarget && <Action label={tr("Buka kiriman", "Open submission")} mode="default" disabled={!focused} onPress={() => void discard(true)} />}
      <Action label={tr("Tinggalkan kiriman", "Discard submission")} disabled={!focused} onPress={() => void discard(false)} />
    </Actions>}
  </View>;
}

function ProtectedImage({ image }: { image: DiscussionAttachment }) {
  const { request, tr, focused = true, shareDiscussionImage } = useCommunity();
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string>();
  const shareRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!focused) setSharing(false);
    return () => {
      shareRequest.current?.abort();
      shareRequest.current = null;
    };
  }, [focused, image.id]);
  async function shareOriginal() {
    if (!shareDiscussionImage || !focused || shareRequest.current) return;
    const controller = new AbortController();
    shareRequest.current = controller;
    setShareError(undefined);
    setSharing(true);
    try {
      const result = await shareDiscussionImage(image.id, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "error") {
        setShareError(result.issue === "unauthorized" || result.issue === "not-found"
          ? tr("Gambar asli tidak tersedia.", "The original image is unavailable.")
          : tr("Gambar asli gagal dibuka. Coba lagi.", "Could not open the original image. Try again."));
      } else if (result.status === "unavailable") {
        setShareError(tr("Perangkat ini tidak dapat membagikan gambar.", "This device cannot share images."));
      } else if (result.status === "busy") {
        setShareError(tr("Tutup panel berbagi lain dan coba lagi.", "Close the other share sheet and try again."));
      }
    } catch {
      if (!controller.signal.aborted) setShareError(tr("Gambar asli gagal dibuka. Coba lagi.", "Could not open the original image. Try again."));
    } finally {
      if (shareRequest.current === controller) {
        shareRequest.current = null;
        setSharing(false);
      }
    }
  }
  const action = useOperation();
  const load = () => void action.run(async () => {
    if (!image.url.startsWith("/api/discussions/attachments/")) throw new Error("Unavailable image");
    const response = await request(image.previewAvailable ? `${image.url}?preview=1` : image.url);
    const type = (response.headers.get("content-type") ?? image.mime).split(";")[0];
    const limit = 8 * 1024 * 1024;
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)
      || Number(response.headers.get("content-length") ?? 0) > limit || !response.arrayBuffer) {
      response.dispose?.();
      throw new Error("Unavailable image");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error("Image too large");
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    setFailed(false);
    setPreview(`data:${type};base64,${globalThis.btoa(chunks.join(""))}`);
  });
  return <View style={styles.field}>
    {preview && !failed
      ? <Image accessibilityLabel={image.name} accessible source={{ uri: preview }} resizeMode="contain"
          onError={() => setFailed(true)} style={{ width: "100%", aspectRatio: Math.max(0.5, Math.min(2, image.width / image.height)) }} />
      : <Actions><Action label={failed ? tr("Muat ulang gambar", "Reload image") : image.name} busy={action.pending} onPress={load} /></Actions>}
    <Notice notice={action.notice} />
    {shareDiscussionImage && <Actions><Action label={tr("Simpan atau bagikan gambar asli", "Save or share original image")}
      busy={sharing} disabled={!focused} onPress={() => void shareOriginal()} /></Actions>}
    <Notice notice={shareError ? { message: shareError, failed: true } : null} />
  </View>;
}

type Apply = (input: object, after?: () => void) => void;

function MessageItem({ message, thread, apply, pending, onReply, channels, visibleRef }: {
  message: DiscussionMessage; thread: DiscussionThread; apply: Apply; pending: boolean;
  onReply(id: string): void; channels: DiscussionChannelMetadata[]; visibleRef: ComponentProps<typeof View>["ref"];
}) {
  const { request, tr, session, navigate } = useCommunity();
  const op = useOperation();
  const [kind, setKind] = useState<"edit" | "delete" | "report" | "forward" | null>(null);
  const [body, setBody] = useState(message.body);
  const [editRevision, setEditRevision] = useState(message.revision);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState<DiscussionAuthorProfile>();
  const [channel, setChannel] = useState(thread.channelId);
  const [target, setTarget] = useState<string | null>(null);
  const [forwardDraft, setForwardDraft] = useState<{ threadId: string; requestId: string }>();
  const [unverifiedForward, setUnverifiedForward] = useState<{ threadId: string; messageId: string }>();
  const [cursor, setCursor] = useState<string>();
  const targets = useRemote<DiscussionPage<DiscussionThread>>(kind === "forward" ? workspace("threads", { channelId: channel, cursor, status: "open" }) : null);
  const close = () => setKind(null);
  const name = message.author?.name ?? (message.kind === "zyra" ? "Zyra" : tr("Pengguna", "User"));
  const profile = (authorId: string) => void op.run(async () => {
    const result = await post<DiscussionAuthorProfile>(request, "discussion", { action: "author", authorId, threadId: thread.id });
    if (result.kind === "student" && result.profile.publicId) navigate(`/students/${encodeURIComponent(result.profile.publicId)}`);
    else setAuthor(result);
  });
  const forward = () => void op.run(async () => {
    const draft = forwardDraft ?? (target ? { threadId: target, requestId: randomUUID() } : null);
    if (!draft) return;
    setForwardDraft(draft);
    const result = await post<DiscussionSendResult>(request, "discussion", { action: "forward", ...draft, messageId: message.id });
    if (result.ok) {
      setForwardDraft(undefined);
      close();
      return;
    }
    if (result.error === "replay_unverified") {
      setUnverifiedForward(result.value);
      return;
    }
    if (result.error !== "unknown") setForwardDraft(undefined);
    if (result.error === "resolved") {
      operationResult({ success: false, error: tr("Diskusi tujuan sudah selesai.", "The destination discussion is resolved.") });
    }
    throw new Error(result.error);
  }, undefined, tr("Pengiriman belum terkonfirmasi. Coba lagi.", "Delivery is unconfirmed. Retry this forward."));
  return <Row title={name} meta={dateLabel(message.createdAt, session.locale, true)} onPress={message.author ? () => profile(message.author!.id) : undefined}>
    {author && <Copy kind="muted">{author.name} · {author.role}</Copy>}
    <View ref={visibleRef} collapsable={false} style={styles.field}>
      {message.replyTo?.excerpt && <Copy kind="muted">{message.replyTo.authorName} · {message.replyTo.excerpt}</Copy>}
      {message.bodyKind === "deleted" || message.bodyKind === "source_unavailable"
        ? <Copy>{message.bodyKind === "deleted" ? tr("Pesan dihapus.", "Message deleted.") : tr("Sumber pesan tidak tersedia.", "Message source unavailable.")}</Copy>
        : <DiscussionMessageBody content={message.body} people={message.mentionedPeople} onPerson={profile} />}
      {message.attachments.map(image => <ProtectedImage key={image.id} image={image} />)}
    </View>
    {message.reactions.length > 0 && <Actions>{message.reactions.map(reaction => <Action key={reaction.emoji}
      label={`${reaction.emoji} ${reaction.count}`} disabled={pending || !message.canReact}
      mode={reaction.selected ? "default" : "outline"}
      onPress={() => apply({ action: "reaction", messageId: message.id, emoji: reaction.emoji, selected: !reaction.selected })} />)}</Actions>}
    <Actions>
      {message.canReact && <Action label={tr("Tambah reaksi", "Add reaction")} disabled={pending}
        onPress={() => setReactionsOpen(open => !open)} />}
      {message.canReply && <Action label={tr("Balas", "Reply")} disabled={pending} onPress={() => onReply(message.id)} />}
      {message.canEdit && <Action label={tr("Edit", "Edit")} disabled={pending} onPress={() => { setBody(message.body); setEditRevision(message.revision); setKind("edit"); }} />}
      {message.canForward && <Action label={tr("Teruskan", "Forward")} disabled={pending} onPress={() => setKind("forward")} />}
      {message.canReport && <Action label={tr("Laporkan", "Report")} disabled={pending} onPress={() => setKind("report")} />}
      {message.canDelete && <Action label={tr("Hapus", "Delete")} disabled={pending} onPress={() => setKind("delete")} />}
    </Actions>
    {message.canReact && reactionsOpen && <Actions>{DISCUSSION_REACTIONS.map(emoji =>
      <Action key={emoji} label={emoji} disabled={pending} onPress={() => {
        setReactionsOpen(false);
        apply({ action: "reaction", messageId: message.id, emoji, selected: !message.reactions.find(item => item.emoji === emoji)?.selected });
      }} />)}</Actions>}
    {kind === "edit" && <>
      <Field label={tr("Isi pesan", "Message")} value={body} onChangeText={setBody} multiline maxLength={12000} />
      <Actions><Action label={tr("Simpan pesan", "Save message")} mode="default" busy={pending} disabled={!body.trim()}
        onPress={() => apply({ action: "edit", messageId: message.id, body, revision: editRevision }, close)} /></Actions>
    </>}
    {kind === "delete" && <Actions><Action label={tr("Konfirmasi hapus pesan", "Confirm message deletion")} mode="destructive" busy={pending}
      onPress={() => apply({ action: "delete", messageId: message.id }, close)} /></Actions>}
    {kind === "report" && <>
      <Field label={tr("Alasan", "Reason")} value={reason} onChangeText={setReason} multiline maxLength={500} />
      <Actions><Action label={tr("Kirim laporan", "Send report")} mode="default" busy={pending} disabled={!reason.trim()}
        onPress={() => apply({ action: "report", messageId: message.id, reason }, close)} /></Actions>
    </>}
    {kind === "forward" && <>
      <Choices value={channel} disabled={Boolean(forwardDraft)} options={channels.map(item => ({ value: item.id, label: item.title }))}
        onSelect={value => { setChannel(value); setCursor(undefined); setTarget(null); }} />
      <Remote state={targets}>{data => <>
        <Choices value={target} disabled={Boolean(forwardDraft)} options={data.items.filter(item => item.id !== thread.id).map(item => ({ value: item.id, label: item.title }))} onSelect={setTarget} />
        {data.nextCursor && !forwardDraft && <Actions><Action label={tr("Diskusi berikutnya", "More discussions")} onPress={() => setCursor(data.nextCursor ?? undefined)} /></Actions>}
      </>}</Remote>
      {unverifiedForward && <Copy kind="error">{tr("Status kiriman belum dapat diperiksa.", "The submission could not be verified.")}</Copy>}
      <Actions>{unverifiedForward ? <Action label={tr("Buka diskusi tujuan", "Open destination")} onPress={() => {
        const query = new URLSearchParams({ thread: unverifiedForward.threadId, message: unverifiedForward.messageId });
        navigate(`/dashboard/discussions?${query}`);
      }} /> : <Action label={forwardDraft ? tr("Coba teruskan ulang", "Retry forward") : tr("Kirim ke diskusi", "Send to discussion")}
        busy={op.pending} disabled={!target} onPress={forward} />}</Actions>
    </>}
    {kind && <Actions><Action label={tr("Batal", "Cancel")} disabled={pending || op.pending} onPress={() => { setForwardDraft(undefined); setUnverifiedForward(undefined); close(); }} /></Actions>}
    <Notice notice={op.notice} />
  </Row>;
}

function ThreadView({ scope, channels }: { scope: Scope; channels: DiscussionChannelMetadata[] }) {
  const { route, request, tr, session, focused = true } = useCommunity();
  const { canInteract, suspended } = useProtectedInteraction();
  const navigate = useDiscussionNavigation();
  const threadId = route.query.thread;
  const [cursor, setCursor] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  const [answerOpen, setAnswerOpen] = useState(false);
  const state = useRemote<ThreadDetail>(workspace("thread", { threadId, messageId: cursor ? undefined : route.query.message, cursor }), { method: "POST" }, threadRefreshDelay);
  const action = useOperation();
  const apply: Apply = (input, after) => void action.run(async () => {
    operationResult(await post(request, "discussion", input));
    after?.();
    state.reload();
  });
  const allowed = state.data?.thread.id === threadId &&
    (!scope.courseId || channels.some(channel => channel.id === state.data?.thread.channelId));
  const pages = useMemo(() => state.data && allowed ? [{
    receipt: state.data.messages.observationReceipt, throughSeq: state.data.readThroughSeq,
    items: state.data.messages.items,
    status: state.data.thread.status,
  }] : [], [allowed, state.data]);
  const canAcknowledge = focused && !suspended && allowed && !state.error && canInteract() && session.role === "student";
  const submitRead = useCallback(async (receipt: { receipt: string; throughSeq: number; messageIds: string[] }, signal: AbortSignal) => {
    if (!canAcknowledge || signal.aborted || !canInteract() || (AppState.currentState && AppState.currentState !== "active")) {
      throw new Error("Discussion viewport is no longer active.");
    }
    operationResult(await post(request, "discussion", { action: "read", threadId, ...receipt }, signal));
  }, [canAcknowledge, canInteract, request, threadId]);
  const { bindRow, retry, failed } = useVisibleDiscussionRead({ pages, enabled: canAcknowledge, submit: submitRead });
  return <>
    <Actions><Action label={tr("Kembali ke diskusi", "Back to discussions")} onPress={() => navigate({ channel: route.query.channel }, true)} /></Actions>
    <Notice notice={action.notice} />
    <Remote state={state}>{data => {
      if (!allowed) return <Copy kind="error">{tr("Diskusi tidak tersedia untuk kursus ini.", "This discussion is unavailable in this course.")}</Copy>;
      const focused = route.query.message;
      const reply = data.messages.items.find(item => item.id === replyTo);
      return <>
        <Copy kind="heading">{data.thread.title}</Copy>
        <Actions>
          <Action label={tr("Perbarui diskusi", "Refresh discussion")} onPress={state.reload} disabled={action.pending} />
          {data.thread.canResolve && <Action label={data.thread.status === "resolved" ? tr("Buka kembali", "Reopen") : tr("Tandai selesai", "Mark resolved")}
            disabled={action.pending} onPress={() => apply({ action: "resolve", threadId, resolved: data.thread.status !== "resolved" })} />}
        </Actions>
        {failed && <View style={styles.field}>
          <Notice notice={{ message: tr("Status baca belum tersimpan.", "Read status could not be saved."), failed: true }} />
          <Actions><Action label={tr("Coba simpan status baca", "Retry read status")} disabled={!canAcknowledge} onPress={retry} /></Actions>
        </View>}
        <Rows>{data.messages.items.map(message => <View key={message.id}>
          {focused === message.id && <Copy kind="muted">{tr("Pesan yang dibuka", "Selected message")}</Copy>}
          <MessageItem visibleRef={bindRow(message.id)} message={message} thread={data.thread} apply={apply} pending={action.pending} onReply={id => { setAnswerOpen(false); setReplyTo(id); }} channels={channels} />
        </View>)}</Rows>
        {data.aiStatuses.map(item => <Copy kind="muted" key={item.messageId}>{discussionAiMessage(item, session.locale)}</Copy>)}
        <Actions>
          {data.messages.previousCursor && <Action label={tr("Pesan lebih baru", "Newer messages")} onPress={() => setCursor(data.messages.previousCursor)} />}
          {data.messages.nextCursor && <Action label={tr("Pesan sebelumnya", "Older messages")} onPress={() => setCursor(data.messages.nextCursor ?? undefined)} />}
          {cursor && <Action label={tr("Pesan terbaru", "Latest messages")} onPress={() => setCursor(undefined)} />}
        </Actions>
        {data.thread.canReply && <Actions><Action mode="default" label={tr("Tulis jawaban", "Write answer")}
          onPress={() => { setReplyTo(undefined); setAnswerOpen(true); }} /></Actions>}
        {((answerOpen && data.thread.canReply) || reply?.canReply) && <Composer
          key={JSON.stringify([data.thread.channelId, scope.skinId, reply?.id])} channelId={data.thread.channelId} skinId={scope.skinId}
          context={reply ? { action: "reply", threadId, replyTo: reply.id } : { action: "answer", threadId }}
          onSent={target => {
            setAnswerOpen(false);
            setReplyTo(undefined);
            setCursor(undefined);
            if (target.messageId === route.query.message) state.reload();
            else navigate({ channel: data.thread.channelId, thread: threadId, message: target.messageId }, true);
          }} />}
      </>;
    }}</Remote>
  </>;
}

function Workspace({ scope }: { scope: Scope }) {
  const { route, tr, request, session } = useCommunity();
  const navigate = useDiscussionNavigation();
  const [catalogCursor, setCatalogCursor] = useState<string>();
  const [cursor, setCursor] = useState<string>();
  const [status, setStatus] = useState<DiscussionThreadStatus>("open");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [composing, setComposing] = useState(false);
  const action = useOperation();
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const catalog = useRemote<Scope["catalog"]>(catalogCursor ? workspace("catalog", { cursor: catalogCursor, courseId: scope.courseId ?? undefined }) : null, { method: "POST" });
  const catalogPage = catalogCursor ? catalog.data : scope.catalog;
  const requested = route.query.channel;
  const detached = useRemote<DiscussionChannelMetadata[]>(!scope.courseId && requested && !catalogPage?.items.some(channel => channel.id === requested)
    ? workspace("channels", {}, [requested]) : null);
  const channels = [...(catalogPage?.items ?? []), ...(detached.data ?? [])];
  const selected = requested ? channels.find(channel => channel.id === requested) : scope.courseId ? channels[0] : undefined;
  const path = (scope.courseId || requested) && !selected ? null : workspace("threads", { channelId: selected?.id, status, search: applied || undefined, cursor });
  const threads = useRemote<DiscussionPage<DiscussionThread>>(route.query.thread ? null : path, undefined, listRefreshDelay);
  useEffect(() => { setCursor(undefined); setComposing(false); }, [requested, scope.courseId]);
  if (route.query.thread) return <ThreadView key={route.query.thread} scope={scope} channels={channels} />;
  return <>
    {catalogCursor && !catalog.data && <Remote state={catalog}>{() => null}</Remote>}
    {channels.length > 0 && <>
      <Choices value={selected?.id ?? ""} options={[
        ...(!scope.courseId ? [{ value: "", label: tr("Semua kanal", "All channels") }] : []),
        ...channels.map(channel => ({ value: channel.id, label: channel.courseTitle ?? channel.title })),
      ]} onSelect={channel => navigate({ channel })} />
      <Actions>
        {catalogCursor && <Action label={tr("Kanal pertama", "First channels")} onPress={() => setCatalogCursor(undefined)} />}
        {catalogPage?.nextCursor && <Action label={tr("Kanal berikutnya", "More channels")} onPress={() => setCatalogCursor(catalogPage.nextCursor ?? undefined)} />}
      </Actions>
    </>}
    {selected && <Toggle label={tr("Bisukan kanal", "Mute channel")} value={muted[selected.id] ?? selected.muted} disabled={action.pending}
      onChange={value => void action.run(async () => {
        operationResult(await post(request, "discussion", { action: "mute", channelId: selected.id, muted: value }));
        setMuted(current => ({ ...current, [selected.id]: value }));
      })} />}
    <Notice notice={action.notice} />
    <Field label={tr("Cari diskusi", "Search discussions")} value={search} onChangeText={setSearch} maxLength={160}
      returnKeyType="search" onSubmitEditing={() => { setCursor(undefined); setApplied(search.trim()); }} />
    <Actions><Action label={tr("Cari", "Search")} onPress={() => { setCursor(undefined); setApplied(search.trim()); }} />
      {selected && <Action label={composing ? tr("Tutup formulir", "Close composer") : tr("Pertanyaan baru", "New question")}
        mode="default" onPress={() => setComposing(value => !value)} />}</Actions>
    {composing && selected && <Composer key={JSON.stringify([selected.id, scope.skinId])} context={{ action: "create", channelId: selected.id }} channelId={selected.id}
      skinId={scope.skinId} onSent={target => navigate({ channel: selected.id, thread: target.threadId, message: target.messageId })} />}
    <Choices value={status} options={[{ value: "open", label: tr("Terbuka", "Open") }, { value: "resolved", label: tr("Selesai", "Resolved") }]}
      onSelect={value => { setStatus(value); setCursor(undefined); }} />
    {!path && requested && !scope.courseId ? <Remote state={detached}>{() => <Copy kind="muted">{tr("Kanal tidak tersedia.", "Channel unavailable.")}</Copy>}</Remote>
      : !path ? <Copy kind="muted">{tr("Belum ada kanal diskusi.", "No discussion channels yet.")}</Copy>
        : <Remote state={threads}>{data => <>
          {!data.items.length && <Copy kind="muted">{tr("Belum ada diskusi.", "No discussions yet.")}</Copy>}
          <Rows>{data.items.map(thread => <Row key={thread.id} title={thread.title}
            meta={`${thread.answerCount} ${tr("jawaban", "answers")} · ${dateLabel(thread.lastActivityAt, session.locale)}`}
            aside={thread.unreadCount ? `${thread.unreadCount} ${tr("belum dibaca", "unread")}` : undefined}
            onPress={() => navigate({ channel: thread.channelId, thread: thread.id })} />)}</Rows>
          <Actions>
            {cursor && <Action label={tr("Halaman pertama", "First page")} onPress={() => setCursor(undefined)} />}
            {data.nextCursor && <Action label={tr("Halaman berikutnya", "Next page")} onPress={() => setCursor(data.nextCursor ?? undefined)} />}
          </Actions>
        </>}</Remote>}
  </>;
}
export function DiscussionsScreen() {
  const { route, tr } = useCommunity();
  const state = useRemote<Scope>(communityPath("discussion-scope", { course: route.params.id }));
  return <Page title={tr("Diskusi", "Discussions")} observeDiscussion><Remote state={state}>{scope => <Workspace scope={scope} />}</Remote></Page>;
}
