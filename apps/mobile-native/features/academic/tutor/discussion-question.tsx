import { randomUUID } from "expo-crypto";
import { useContext, useEffect, useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import type { DiscussionChannelMetadata, DiscussionMention } from "../../../../../lib/discussions/contracts";
import { activeTutorMentions, insertTutorMention, tutorMentionSubmission } from "../../../../../packages/academic/tutor-discussion-mentions";
import type { TutorDiscussionTarget, TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import type { TutorQuestionDraft } from "../../../../../packages/academic/tutor-discussion-workspace";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { TutorDiscussionImages } from "./discussion-images";
import { TutorDiscussionMentionPicker } from "./discussion-mentions";
import { Label, TutorDetail, tutorLayout, type TutorTheme } from "./ui";

type Props = {
  channel: DiscussionChannelMetadata; courseId?: string; service: TutorSupportClient; theme: TutorTheme;
  close(): void; sent(target: TutorDiscussionTarget): void;
};

const empty = (): TutorQuestionDraft => ({ title: "", body: "", mentions: [], images: [] });

export function TutorDiscussionQuestion({ channel, courseId, service, theme, close, sent }: Props) {
  const workspace = service.discussionWorkspace;
  const imageActions = useContext(TutorDiscussionImages);
  const { canInteract } = useProtectedInteraction();
  const [draft, setDraft] = useState(() => workspace?.questionDraft(channel.id) ?? empty());
  const [uncertain, setUncertain] = useState(() => Boolean(workspace?.pendingQuestion(channel.id)));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [legacyTarget, setLegacyTarget] = useState<TutorDiscussionTarget>();
  const operation = useRef<AbortController | null>(null);
  const field = useRef<ComponentRef<typeof Input>>(null);
  const selection = useRef({ start: draft.body.length, end: draft.body.length });
  const [requestedSelection, setRequestedSelection] = useState<typeof selection.current>();
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => { workspace?.rememberQuestionDraft(channel.id, draft); }, [channel.id, draft, workspace]);

  function choose(person?: DiscussionMention) {
    if (!canInteract() || busy || uncertain) return;
    const result = insertTutorMention(draft.body, selection.current, draft.mentions, person);
    if (!result) { setNotice("Gunakan maksimal 10 sebutan dan 12.000 karakter."); return; }
    setDraft(previous => ({ ...previous, body: result.body, mentions: result.bindings }));
    setRequestedSelection(result.selection);
    setMentionOpen(false);
    requestAnimationFrame(() => field.current?.focus());
  }

  async function attach() {
    if (!imageActions || operation.current || !canInteract() || uncertain || draft.images.length >= 4) return;
    const controller = new AbortController();
    operation.current = controller;
    setPicking(true);
    setNotice("");
    try {
      const image = await imageActions.pick(channel.id, "new-" + channel.id, controller.signal);
      if (image && !controller.signal.aborted) setDraft(previous => ({ ...previous, images: [...previous.images, image] }));
    } catch {
      if (!controller.signal.aborted) setNotice("Gambar gagal dilampirkan.");
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setPicking(false);
    }
  }

  async function submit() {
    if (!workspace || operation.current || !canInteract() || (!draft.body.trim() && !draft.images.length)) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setNotice("");
    const attempt = workspace.pendingQuestion(channel.id) ?? { action: "create" as const, requestId: randomUUID(), input: {
      channelId: channel.id, body: draft.body.trim(), ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
      attachmentIds: draft.images.map(image => image.id), ...tutorMentionSubmission(draft.body, draft.mentions),
    } };
    try {
      const result = await workspace.create(courseId, attempt, controller.signal);
      if (controller.signal.aborted) return;
      setUncertain(Boolean(workspace.pendingQuestion(channel.id)));
      if (result.ok) { sent(result.value); return; }
      if (result.error === "replay_unverified") {
        setLegacyTarget(result.value);
        setNotice("Isi kiriman lama belum terkonfirmasi.");
        return;
      }
      setNotice({
        invalid: "Periksa kembali isi pertanyaan.", unavailable: "Akses kanal berubah.", conflict: "Pertanyaan telah berubah.",
        resolved: "Diskusi telah selesai.", attachment_expired: "Lampiran kedaluwarsa. Lepas lalu unggah kembali.",
        rate_limited: "Terlalu banyak permintaan. Coba lagi nanti.", unknown: "Pengiriman belum terkonfirmasi. Coba lagi.",
      }[result.error]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setUncertain(Boolean(workspace.pendingQuestion(channel.id)));
      setNotice(error instanceof TutorDataError && [401,403,404].includes(error.status)
        ? "Akses kanal berubah." : "Pertanyaan belum dapat dikirim. Coba lagi.");
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const locked = busy || uncertain || Boolean(legacyTarget);
  return <TutorDetail title="Pertanyaan baru" subtitle={channel.courseTitle ?? channel.title} theme={theme} onBack={() => { if (!busy) close(); }}>
    <Input theme={theme} accessibilityLabel="Judul pertanyaan" placeholder="Judul opsional" maxLength={160}
      value={draft.title} editable={!locked} onChangeText={title => setDraft(previous => ({ ...previous, title }))} />
    <Input ref={field} theme={theme} accessibilityLabel="Isi pertanyaan" placeholder="Tulis pertanyaan" multiline maxLength={12_000}
      value={draft.body} editable={!locked} selection={requestedSelection}
      onSelectionChange={event => { selection.current = event.nativeEvent.selection; if (requestedSelection) setRequestedSelection(undefined); }}
      onChangeText={body => setDraft(previous => ({ ...previous, body, mentions: activeTutorMentions(body, previous.mentions) }))} />
    {draft.images.length ? <View style={tutorLayout.cluster}>{draft.images.map(image => <Button key={image.id} theme={theme} variant="outline"
      disabled={locked} accessibilityLabel={`Lepas ${image.name}`} onPress={() => setDraft(previous => ({
        ...previous, images: previous.images.filter(item => item.id !== image.id),
      }))}>{image.name}</Button>)}</View> : null}
    <View style={tutorLayout.cluster}>
      {imageActions ? <Button theme={theme} variant="outline" disabled={locked || draft.images.length >= 4} isLoading={picking} onPress={attach}>Lampirkan gambar</Button> : null}
      <Button theme={theme} variant="outline" disabled={locked} onPress={() => setMentionOpen(value => !value)}>Sebut peserta</Button>
      <Button theme={theme} variant="outline" disabled={locked} onPress={() => choose()}>Tanya Zyra</Button>
    </View>
    {mentionOpen && !locked ? <TutorDiscussionMentionPicker {...{ theme, courseId, service }} channelId={channel.id} select={choose}
      close={() => setMentionOpen(false)} /> : null}
    {notice ? <Label theme={theme} tone="error">{notice}</Label> : null}
    {legacyTarget ? <Button theme={theme} onPress={() => sent(legacyTarget)}>Periksa kiriman</Button>
      : <Button theme={theme} testID="tutor-discussion-create-send" disabled={picking || (!draft.body.trim() && !draft.images.length)} isLoading={busy} onPress={submit}>{uncertain ? "Coba kirim lagi" : "Kirim pertanyaan"}</Button>}
  </TutorDetail>;
}
