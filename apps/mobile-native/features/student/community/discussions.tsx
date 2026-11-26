import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import { DiscussionMessageBody } from "./discussion-markdown";
import type {
  DiscussionAttachment, DiscussionAuthorProfile, DiscussionChannelMetadata, DiscussionMention, DiscussionMessage, DiscussionPage,
  DiscussionSendResult, DiscussionSubmit, DiscussionThread, DiscussionThreadStatus,
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
type DraftContext = { action: "create"; channelId: string } | { action: "answer"; threadId: string }
  | { action: "reply"; threadId: string; replyTo: string };
type DraftSend = { action: DraftContext["action"]; input: DiscussionSubmit & { channelId?: string; threadId?: string; replyTo?: string; title?: string } };

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

type UploadedImage = { id: string; name: string };
function Composer({ context, channelId, skinId, onSent }: {
  context: DraftContext; channelId: string; skinId: string | null; onSent(target: { threadId: string; messageId: string }): void;
}) {
  const { request, tr, session, pickAssessmentFile } = useCommunity();
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [askZyra, setAskZyra] = useState(false);
  const [attachments, setAttachments] = useState<UploadedImage[]>([]);
  const [mentions, setMentions] = useState<{ id: string; handle: string }[]>([]);
  const [mentionResults, setMentionResults] = useState<DiscussionMention[]>([]);
  const [search, setSearch] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<DraftSend>();
  const [replayTarget, setReplayTarget] = useState<{ threadId: string; messageId: string }>();
  const [notice, setNotice] = useState<string>();
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const action = useOperation();
  const reset = () => {
    setPendingSend(undefined);
    setReplayTarget(undefined);
    setBody("");
    setTitle("");
    setAskZyra(false);
    setAttachments([]);
    setMentions([]);
    setNotice(undefined);
  };
  const submit = async () => {
    if (lock.current || action.pending) return;
    lock.current = true;
    setSending(true);
    setNotice(undefined);
    const draft = pendingSend ?? {
      action: context.action,
      input: {
        body, requestId: randomUUID(), askZyra, skinId, attachmentIds: attachments.map(image => image.id),
        mentionIds: mentions.map(item => item.id), mentionHandles: mentions.map(item => item.handle),
        ...(context.action === "create" ? { channelId: context.channelId, title: title.trim() || undefined }
          : { threadId: context.threadId, ...(context.action === "reply" ? { replyTo: context.replyTo } : {}) }),
      },
    };
    setPendingSend(draft);
    try {
      const result = await post<DiscussionSendResult>(request, "discussion", draft);
      if (result.ok) {
        reset();
        onSent(result.value);
        return;
      }
      if (result.error === "replay_unverified") {
        setReplayTarget(result.value);
        setNotice(tr("Status kiriman belum dapat diperiksa. Buka diskusi untuk memeriksanya.", "The submission could not be verified. Open the discussion to check it."));
        return;
      }
      const labels = {
        unavailable: tr("Akses diskusi berubah.", "Discussion access has changed."),
        invalid: tr("Periksa isi dan pilihan Anda.", "Check your message and selections."),
        rate_limited: tr("Terlalu banyak permintaan. Coba lagi nanti.", "Too many requests. Try again later."),
        conflict: tr("Percobaan ini bertentangan dengan kiriman sebelumnya.", "This request conflicts with an earlier submission."),
        resolved: tr("Diskusi sudah selesai.", "The discussion is resolved."),
        attachment_expired: tr("Lampiran kedaluwarsa. Lepas lalu unggah kembali.", "An attachment expired. Remove it and upload it again."),
        unknown: tr("Pengiriman belum terkonfirmasi. Coba kirim ulang dengan identitas yang sama.", "Delivery is unconfirmed. Retry this submission with the same request ID."),
      };
      setNotice(labels[result.error]);
      if (result.error !== "unknown") setPendingSend(undefined);
    } catch {
      setNotice(tr("Pengiriman belum terkonfirmasi. Coba kirim ulang dengan identitas yang sama.", "Delivery is unconfirmed. Retry this submission with the same request ID."));
    } finally {
      lock.current = false;
      setSending(false);
    }
  };
  const upload = () => void action.run(async () => {
    const selected = await pickAssessmentFile?.();
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || (selected.size ?? 0) > 8 * 1024 * 1024) {
      throw new Error("Invalid image");
    }
    const form = new FormData();
    form.append("channelId", channelId);
    form.append("file", selected as unknown as Blob);
    const item = await readJson<UploadedImage>(request, "/api/discussions/attachments", { method: "POST", headers: { Origin: new URL(session.origin).origin }, body: form });
    setAttachments(items => [...items, { id: item.id, name: selected.name }]);
  }, undefined, tr("Unggah gambar belum berhasil. Gunakan JPEG, PNG, atau WebP hingga 8 MiB.", "Image upload failed. Use JPEG, PNG, or WebP up to 8 MiB."));
  const lookup = () => void action.run(async () => {
    setMentionResults(await post<DiscussionMention[]>(request, "discussion", context.action === "create"
      ? { action: "channel-mentions", channelId, search: search.trim() }
      : { action: "mentions", threadId: context.threadId, search: search.trim() }));
  });
  const locked = Boolean(pendingSend) || sending;
  return <View style={styles.block}>
    {context.action === "create" && <Field label={tr("Judul pertanyaan (opsional)", "Question title (optional)")} value={title} onChangeText={setTitle} maxLength={160} editable={!locked} />}
    <Field testID={context.action === "answer" ? "student-discussion-answer" : undefined} label={context.action === "create" ? tr("Pertanyaan", "Question") : context.action === "answer" ? tr("Jawaban", "Answer") : tr("Balasan", "Reply")}
      value={body} onChangeText={value => {
        setBody(value);
        setMentions(items => items.filter(item => value.includes(`@${item.handle}`)));
      }} multiline maxLength={12000} editable={!locked} />
    <Toggle label={tr("Tanya Zyra", "Ask Zyra")} value={askZyra} onChange={setAskZyra} disabled={locked} />
    <Actions>{pickAssessmentFile && <Action label={tr("Lampirkan gambar", "Attach image")} disabled={locked || action.pending || attachments.length >= 4} onPress={upload} />}
      <Action label={tr("Sebut peserta", "Mention someone")} disabled={locked} onPress={() => setMentionOpen(value => !value)} /></Actions>
    {attachments.map(image => <Row key={image.id} title={image.name}>
      <Actions><Action label={tr("Lepas gambar", "Remove image")} disabled={locked} onPress={() => setAttachments(items => items.filter(item => item.id !== image.id))} /></Actions>
    </Row>)}
    {mentionOpen && <>
      <Field label={tr("Nama peserta", "Participant name")} value={search} onChangeText={setSearch} maxLength={80} editable={!locked} />
      <Actions><Action label={tr("Cari peserta", "Find participant")} busy={action.pending} disabled={locked || !search.trim()} onPress={lookup} /></Actions>
      {mentionResults.map(item => <Row key={item.id} title={item.name} meta={item.context ?? undefined} onPress={locked ? undefined : () => {
        let handle = item.name.normalize("NFKD").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 60) || "anggota";
        if (handle.toLowerCase() === "zyra" || mentions.some(value => value.handle.toLowerCase() === handle.toLowerCase())) handle = `${handle}_${mentions.length}`;
        if (mentions.length >= 10 || mentions.some(value => value.id === item.id) || body.length + handle.length + 2 > 12000) return;
        setMentions(items => [...items, { id: item.id, handle }]);
        setBody(value => `${value} @${handle} `);
        setMentionOpen(false);
      }} />)}
    </>}
    {notice && <Notice notice={{ message: notice, failed: true }} />}
    <Notice notice={action.notice} />
    <Actions>{replayTarget ? <Action label={tr("Buka kiriman", "Open submission")} mode="default" onPress={() => {
      reset();
      onSent(replayTarget);
    }} /> : <Action label={pendingSend ? tr("Coba kirim ulang", "Retry submission") : context.action === "create"
      ? tr("Kirim pertanyaan", "Send question") : context.action === "answer" ? tr("Kirim jawaban", "Send answer") : tr("Kirim balasan", "Send reply")}
      mode="default" busy={sending} disabled={(!body.trim() && !attachments.length) || action.pending} onPress={() => void submit()} />}
      {pendingSend && !sending && <Action label={tr("Tinggalkan kiriman", "Discard submission")} onPress={reset} />}</Actions>
  </View>;
}

function ProtectedImage({ image }: { image: DiscussionAttachment }) {
  const { request, tr } = useCommunity();
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
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
  </View>;
}

type Apply = (input: object, after?: () => void) => void;

function MessageItem({ message, thread, apply, pending, onReply, channels }: {
  message: DiscussionMessage; thread: DiscussionThread; apply: Apply; pending: boolean;
  onReply(id: string): void; channels: DiscussionChannelMetadata[];
}) {
  const { request, tr, session, navigate } = useCommunity();
  const op = useOperation();
  const [kind, setKind] = useState<"edit" | "delete" | "report" | "forward" | null>(null);
  const [body, setBody] = useState(message.body);
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
    {message.replyTo?.excerpt && <Copy kind="muted">{message.replyTo.authorName} · {message.replyTo.excerpt}</Copy>}
    {message.bodyKind === "deleted" || message.bodyKind === "source_unavailable"
      ? <Copy>{message.bodyKind === "deleted" ? tr("Pesan dihapus.", "Message deleted.") : tr("Sumber pesan tidak tersedia.", "Message source unavailable.")}</Copy>
      : <DiscussionMessageBody content={message.body} people={message.mentionedPeople} onPerson={profile} />}
    {message.attachments.map(image => <ProtectedImage key={image.id} image={image} />)}
    {message.reactions.length > 0 && <Actions>{message.reactions.map(reaction => <Action key={reaction.emoji}
      label={`${reaction.emoji} ${reaction.count}`} disabled={pending || !message.canReact}
      mode={reaction.selected ? "default" : "outline"}
      onPress={() => apply({ action: "reaction", messageId: message.id, emoji: reaction.emoji, selected: !reaction.selected })} />)}</Actions>}
    <Actions>
      {message.canReact && !message.reactions.some(reaction => reaction.emoji === "👍") &&
        <Action label="👍" disabled={pending} onPress={() => apply({ action: "reaction", messageId: message.id, emoji: "👍", selected: true })} />}
      {message.canReply && <Action label={tr("Balas", "Reply")} disabled={pending} onPress={() => onReply(message.id)} />}
      {message.canEdit && <Action label={tr("Edit", "Edit")} disabled={pending} onPress={() => { setBody(message.body); setKind("edit"); }} />}
      {message.canForward && <Action label={tr("Teruskan", "Forward")} disabled={pending} onPress={() => setKind("forward")} />}
      {message.canReport && <Action label={tr("Laporkan", "Report")} disabled={pending} onPress={() => setKind("report")} />}
      {message.canDelete && <Action label={tr("Hapus", "Delete")} disabled={pending} onPress={() => setKind("delete")} />}
    </Actions>
    {kind === "edit" && <>
      <Field label={tr("Isi pesan", "Message")} value={body} onChangeText={setBody} multiline maxLength={12000} />
      <Actions><Action label={tr("Simpan pesan", "Save message")} mode="default" busy={pending} disabled={!body.trim()}
        onPress={() => apply({ action: "edit", messageId: message.id, body, revision: message.revision }, close)} /></Actions>
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
  const { route, request, tr } = useCommunity();
  const navigate = useDiscussionNavigation();
  const threadId = route.query.thread;
  const [cursor, setCursor] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  const [answerOpen, setAnswerOpen] = useState(false);
  const state = useRemote<ThreadDetail>(workspace("thread", { threadId, messageId: cursor ? undefined : route.query.message, cursor }), { method: "POST" });
  const action = useOperation();
  const apply: Apply = (input, after) => void action.run(async () => {
    operationResult(await post(request, "discussion", input));
    after?.();
    state.reload();
  });
  const read = (data: ThreadDetail) => {
    const items = [...data.messages.items].sort((a, b) => a.seq - b.seq);
    let throughSeq = data.readThroughSeq;
    for (const item of items) if (item.seq === throughSeq + 1) throughSeq = item.seq;
    apply({ action: "read", threadId, throughSeq, receipt: data.messages.observationReceipt, messageIds: items.map(item => item.id) });
  };
  return <>
    <Actions><Action label={tr("Kembali ke diskusi", "Back to discussions")} onPress={() => navigate({ channel: route.query.channel }, true)} /></Actions>
    <Notice notice={action.notice} />
    <Remote state={state}>{data => {
      const allowed = !scope.courseId || channels.some(channel => channel.id === data.thread.channelId);
      if (!allowed) return <Copy kind="error">{tr("Diskusi tidak tersedia untuk kursus ini.", "This discussion is unavailable in this course.")}</Copy>;
      const focused = route.query.message;
      const reply = data.messages.items.find(item => item.id === replyTo);
      return <>
        <Copy kind="heading">{data.thread.title}</Copy>
        <Actions>
          <Action label={tr("Perbarui diskusi", "Refresh discussion")} onPress={state.reload} disabled={action.pending} />
          {data.thread.unreadCount > 0 && data.messages.items.length > 0 && <Action label={tr("Tandai halaman telah dibaca", "Mark page as read")}
            disabled={action.pending} onPress={() => read(data)} />}
          {data.thread.canResolve && <Action label={data.thread.status === "resolved" ? tr("Buka kembali", "Reopen") : tr("Tandai selesai", "Mark resolved")}
            disabled={action.pending} onPress={() => apply({ action: "resolve", threadId, resolved: data.thread.status !== "resolved" })} />}
        </Actions>
        <Rows>{data.messages.items.map(message => <View key={message.id}>
          {focused === message.id && <Copy kind="muted">{tr("Pesan yang dibuka", "Selected message")}</Copy>}
          <MessageItem key={message.id} message={message} thread={data.thread} apply={apply} pending={action.pending} onReply={id => { setAnswerOpen(false); setReplyTo(id); }} channels={channels} />
        </View>)}</Rows>
        {data.aiStatuses.map(item => <Copy kind="muted" key={item.messageId}>Zyra · {item.status}</Copy>)}
        <Actions>
          {data.messages.previousCursor && <Action label={tr("Pesan lebih baru", "Newer messages")} onPress={() => setCursor(data.messages.previousCursor)} />}
          {data.messages.nextCursor && <Action label={tr("Pesan sebelumnya", "Older messages")} onPress={() => setCursor(data.messages.nextCursor ?? undefined)} />}
          {cursor && <Action label={tr("Pesan terbaru", "Latest messages")} onPress={() => setCursor(undefined)} />}
        </Actions>
        {data.thread.canReply && <Actions><Action mode="default" label={tr("Tulis jawaban", "Write answer")}
          onPress={() => { setReplyTo(undefined); setAnswerOpen(true); }} /></Actions>}
        {((answerOpen && data.thread.canReply) || reply?.canReply) && <Composer
          key={reply?.id ?? "answer"} channelId={data.thread.channelId} skinId={scope.skinId}
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
  const threads = useRemote<DiscussionPage<DiscussionThread>>(route.query.thread ? null : path);
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
    {composing && selected && <Composer key={selected.id} context={{ action: "create", channelId: selected.id }} channelId={selected.id}
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
  return <Page title={tr("Diskusi", "Discussions")}><Remote state={state}>{scope => <Workspace scope={scope} />}</Remote></Page>;
}
