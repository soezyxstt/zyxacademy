import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { DiscussionChannelMetadata, DiscussionPage } from "../../../../../lib/discussions/contracts";
import type { TutorDiscussionTarget } from "../../../../../packages/academic/tutor-support";
import type { TutorDiscussionMessageCommand, TutorDiscussionMessageScope, TutorDiscussionMessageView,
  TutorDiscussionWorkspaceClient, TutorForwardTarget } from "../../../../../packages/academic/tutor-discussion-workspace";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Label, Row, tutorLayout, type TutorTheme } from "./ui";

type Mode = "edit" | "delete" | "report" | "forward";

type Props = {
  theme: TutorTheme; client: TutorDiscussionWorkspaceClient; courseId?: string; threadId: string; message: TutorDiscussionMessageView;
  readback(messageId: string, signal: AbortSignal): Promise<TutorDiscussionMessageView | undefined>;
  open(target: TutorDiscussionTarget): void;
};

export function TutorDiscussionMessageActions({ theme, client, courseId, threadId, message, readback, open }: Props) {
  const { canInteract } = useProtectedInteraction();
  const scope = { threadId, messageId: message.id };
  const [mode, setMode] = useState<Mode>();
  const [menu, setMenu] = useState(false);
  const [body, setBody] = useState("");
  const [revision, setRevision] = useState(0);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReadback, setNeedsReadback] = useState<TutorDiscussionMessageCommand>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function start(next: Mode) {
    if (busy || !canInteract()) return;
    setMode(next); setNotice(""); setNeedsReadback(undefined);
    if (next === "edit") { setBody(message.body); setRevision(message.revision ?? 0); }
    if (next === "report") setReason("");
  }

  async function check(command: TutorDiscussionMessageCommand, signal: AbortSignal) {
    try {
      const current = await readback(command.messageId, signal);
      if (!current || signal.aborted) return false;
      const confirmed = command.action === "delete" ? current.bodyKind === "deleted"
        : command.action === "edit" && (current.revision ?? 0) > command.revision && current.body === command.body.trim();
      if (confirmed) { setNeedsReadback(undefined); setMode(undefined); setMenu(false); setNotice("Perubahan sudah tampil."); }
      return confirmed;
    } catch {
      return false;
    }
  }

  async function execute(selected: Exclude<Mode, "forward">) {
    if (!canInteract() || request.current || needsReadback) return;
    const commandBase = { ...scope, requestId: randomUUID() };
    const action: TutorDiscussionMessageCommand = selected === "edit" ? { action: "edit", ...commandBase, body, revision }
      : selected === "report" ? { action: "report", ...commandBase, reason: reason.trim() }
      : { action: "delete", ...commandBase };
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setNotice("");
    try {
      await client.message(courseId, action, controller.signal);
      if (controller.signal.aborted) return;
      setMode(undefined); setMenu(false);
      setNotice(selected === "report" ? "Laporan dikirim." : selected === "edit" ? "Pesan diperbarui." : "Pesan dihapus.");
      if (selected !== "report") await readback(action.messageId, controller.signal).catch(() => undefined);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const definitive = failure instanceof TutorDataError && [400, 401, 403, 404, 409, 429].includes(failure.status);
      if (selected !== "report" && !definitive) {
        if (await check(action, controller.signal) || controller.signal.aborted) return;
        setNeedsReadback(action);
        setNotice("Perubahan belum terkonfirmasi. Periksa pesan terbaru.");
      } else {
        setNotice(definitive ? "Pesan berubah atau tindakan tidak tersedia. Muat ulang pesan."
          : "Laporan belum terkonfirmasi. Coba kembali.");
        if (selected !== "report") {
          await readback(action.messageId, controller.signal).catch(() => undefined);
          if (!controller.signal.aborted) { setMode(undefined); setMenu(false); }
        }
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function verify() {
    if (!needsReadback || request.current || !canInteract()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      if (!await check(needsReadback, controller.signal) && !controller.signal.aborted) {
        setNotice("Hasil perubahan belum terkonfirmasi.");
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const any = message.canEdit || message.canDelete || message.canReport || message.canForward;
  if (!any && !notice) return null;
  return <View style={tutorLayout.group}>
    {any ? <Button theme={theme} variant="outline" testID={`tutor-discussion-message-options-${message.id}`}
      accessibilityState={{ expanded: menu }} onPress={() => { if (canInteract() && !busy) setMenu(value => !value); }}>Opsi pesan</Button> : null}
    {menu && !mode ? <View style={tutorLayout.cluster}>
      {message.canEdit && message.revision ? <Button theme={theme} variant="outline" onPress={() => start("edit")}>Edit</Button> : null}
      {message.canDelete ? <Button theme={theme} variant="outline" onPress={() => start("delete")}>Hapus</Button> : null}
      {message.canReport ? <Button theme={theme} variant="outline" onPress={() => start("report")}>Laporkan</Button> : null}
      {message.canForward ? <Button theme={theme} variant="outline" onPress={() => start("forward")}>Teruskan</Button> : null}
    </View> : null}
    {menu && mode === "edit" ? <>
      <Input theme={theme} accessibilityLabel="Isi pesan" value={body} multiline maxLength={12_000} editable={!busy && !needsReadback} onChangeText={setBody} />
      <Button theme={theme} isLoading={busy} disabled={Boolean(needsReadback) || body.trim() === message.body.trim() || (!body.trim() && !message.attachmentCount)}
        onPress={() => void execute("edit")}>Simpan pesan</Button>
    </> : null}
    {menu && mode === "delete" ? <>
      <Label theme={theme} tone="muted">Pesan akan dihapus dari diskusi.</Label>
      <Button theme={theme} variant="destructive" isLoading={busy} disabled={Boolean(needsReadback)} onPress={() => void execute("delete")}>Konfirmasi hapus pesan</Button>
    </> : null}
    {menu && mode === "report" ? <>
      <Input theme={theme} accessibilityLabel="Alasan laporan" value={reason} multiline maxLength={1_000} editable={!busy} onChangeText={setReason} />
      <Button theme={theme} isLoading={busy} disabled={!reason.trim()} onPress={() => void execute("report")}>Kirim laporan</Button>
    </> : null}
    {menu && mode === "forward" ? <ForwardActions {...{ theme, client, courseId, scope, open }} /> : null}
    {menu && mode ? <Button theme={theme} variant="outline" disabled={busy} onPress={() => { setMode(undefined); setNeedsReadback(undefined); }}>Tutup opsi</Button> : null}
    {needsReadback ? <Button theme={theme} variant="outline" isLoading={busy} onPress={() => void verify()}>Periksa pesan</Button> : null}
    {notice ? <Label theme={theme} tone="muted">{notice}</Label> : null}
  </View>;
}

function ForwardActions({ theme, client, courseId, scope, open }: Pick<Props, "theme" | "client" | "courseId" | "open"> & {
  scope: TutorDiscussionMessageScope;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const { threadId, messageId } = scope;
  const [channel, setChannel] = useState<DiscussionChannelMetadata>();
  const [channels, setChannels] = useState<DiscussionPage<DiscussionChannelMetadata>>();
  const [targets, setTargets] = useState<DiscussionPage<TutorForwardTarget>>();
  const [cursor, setCursor] = useState<string>();
  const [channelCursor, setChannelCursor] = useState<string>();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [retry, setRetry] = useState(0);
  const [target, setTarget] = useState(() => client.pendingForward({ threadId, messageId })?.destinationId);
  const [pending, setPending] = useState(() => Boolean(client.pendingForward({ threadId, messageId })));
  const [sent, setSent] = useState<TutorDiscussionTarget>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (pending || sent || suspended) return;
    const controller = new AbortController();
    const currentScope = { threadId, messageId };
    if (channel) {
      setTargets(undefined);
      void client.forwardTargets(courseId, currentScope, channel.id, term, cursor, controller.signal).then(page => {
        if (!controller.signal.aborted) setTargets(page);
      }).catch(() => {
        if (!controller.signal.aborted) setNotice("Diskusi tujuan tidak dapat dimuat.");
      });
    } else {
      setChannels(undefined);
      void client.forwardChannels(courseId, currentScope, term, channelCursor, controller.signal).then(page => {
        if (!controller.signal.aborted) setChannels(page);
      }).catch(() => {
        if (!controller.signal.aborted) setNotice("Kanal tujuan tidak dapat dimuat.");
      });
    }
    return () => controller.abort();
  }, [client, courseId, threadId, messageId, channel, cursor, channelCursor, term, retry, pending, sent, suspended]);

  async function submit() {
    if (!target || !canInteract() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setNotice("");
    try {
      const result = await client.forward(courseId, client.pendingForward(scope) ?? { action: "forward", ...scope, destinationId: target, requestId: randomUUID() }, controller.signal);
      if (controller.signal.aborted) return;
      setPending(Boolean(client.pendingForward(scope)));
      if (result.ok || result.error === "replay_unverified") {
        setSent(result.value);
        setNotice(result.ok ? "Pesan diteruskan." : "Isi kiriman lama belum terkonfirmasi.");
      } else {
        setNotice(result.error === "resolved" ? "Diskusi tujuan sudah selesai."
          : result.error === "unknown" || result.error === "rate_limited" ? "Pengiriman belum terkonfirmasi. Coba lagi."
          : "Pesan tidak dapat diteruskan ke diskusi itu.");
      }
    } catch {
      if (!controller.signal.aborted) {
        const uncertain = Boolean(client.pendingForward(scope));
        setPending(uncertain);
        setNotice(uncertain ? "Pengiriman belum terkonfirmasi. Coba lagi." : "Akses ke diskusi tujuan berubah.");
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <View style={tutorLayout.group}>
    {sent ? <Button theme={theme} onPress={() => open(sent)}>Buka diskusi tujuan</Button> : <>
      {!pending ? <>
        {channel ? <Button theme={theme} variant="outline" onPress={() => {
          setChannel(undefined); setTarget(undefined); setTerm(""); setSearch(""); setCursor(undefined); setNotice("");
        }}>{`Kanal tujuan: ${channel.courseTitle ?? channel.title}`}</Button> : null}
        <Input theme={theme} accessibilityLabel={channel ? "Cari diskusi tujuan" : "Cari kanal tujuan"} returnKeyType="search" maxLength={160}
          value={search} onChangeText={setSearch} onSubmitEditing={() => { setTerm(search.trim()); setCursor(undefined); setChannelCursor(undefined); setTarget(undefined); setNotice(""); }} />
        {search.trim() !== term ? <Button theme={theme} variant="outline" onPress={() => {
          setTerm(search.trim()); setCursor(undefined); setChannelCursor(undefined); setTarget(undefined); setNotice("");
        }}>Cari</Button> : null}
        {channel ? targets?.items.map(item => <Row key={item.id} theme={theme} title={item.title}
          meta={target === item.id ? "Dipilih" : undefined} onPress={() => setTarget(item.id)} />)
          : channels?.items.map(item => <Row key={item.id} theme={theme} title={item.courseTitle ?? item.title} onPress={() => {
            setChannel(item); setNotice(""); setTerm(""); setSearch(""); setCursor(undefined);
          }} />)}
        {!notice && !(channel ? targets : channels) ? <ActivityIndicator accessibilityLabel="Memuat tujuan" /> : null}
        {(channel ? targets : channels)?.items.length === 0 ? <Label theme={theme} tone="muted">Tujuan tidak ditemukan.</Label> : null}
        {channel && targets?.nextCursor ? <Button theme={theme} variant="outline" onPress={() => { setTarget(undefined); setCursor(targets.nextCursor ?? undefined); }}>Diskusi berikutnya</Button> : null}
        {!channel && channels?.nextCursor ? <Button theme={theme} variant="outline" onPress={() => setChannelCursor(channels.nextCursor ?? undefined)}>Kanal berikutnya</Button> : null}
        {notice && !(channel ? targets : channels) ? <Button theme={theme} variant="outline" onPress={() => { setNotice(""); setRetry(value => value + 1); }}>Muat ulang tujuan</Button> : null}
      </> : null}
      {target ? <Button theme={theme} isLoading={busy} onPress={() => void submit()}>{pending ? "Coba teruskan ulang" : "Teruskan pesan"}</Button> : null}
    </>}
    {notice ? <Label theme={theme} tone="muted">{notice}</Label> : null}
  </View>;
}
