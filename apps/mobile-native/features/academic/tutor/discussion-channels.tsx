import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { DiscussionChannelMetadata, DiscussionPage } from "../../../../../lib/discussions/contracts";
import type { TutorDiscussionWorkspaceClient } from "../../../../../packages/academic/tutor-discussion-workspace";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Label, Row, tutorLayout, type TutorTheme } from "./ui";

type Props = {
  client: TutorDiscussionWorkspaceClient; courseId?: string; theme: TutorTheme; selected?: DiscussionChannelMetadata;
  choose(channel?: DiscussionChannelMetadata): void; create(channel: DiscussionChannelMetadata): void;
};

export function TutorDiscussionChannels({ client, courseId, theme, selected, choose, create }: Props) {
  const { canInteract, suspended } = useProtectedInteraction();
  const [page, setPage] = useState<DiscussionPage<DiscussionChannelMetadata>>();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [muting, setMuting] = useState(false);
  const [muteError, setMuteError] = useState("");
  const write = useRef<AbortController | null>(null);
  const apply = useRef(choose);
  apply.current = choose;
  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    if (suspended) return;
    const controller = new AbortController();
    setLoading(true);
    setReadError(false);
    void client.catalog(courseId, term, cursor, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setPage(result);
      if (courseId) apply.current(result.items.find(item => item.kind === "course"));
    }).catch(() => {
      if (!controller.signal.aborted) setReadError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [client, courseId, term, cursor, attempt, suspended]);

  async function mute(channel: DiscussionChannelMetadata) {
    if (!canInteract() || write.current) return;
    const controller = new AbortController();
    write.current = controller;
    setMuting(true);
    setMuteError("");
    try {
      await client.mute(courseId, channel.id, !channel.muted, randomUUID(), controller.signal);
      if (controller.signal.aborted) return;
      const updated = { ...channel, muted: !channel.muted };
      setPage(current => current && { ...current, items: current.items.map(item => item.id === channel.id ? updated : item) });
      apply.current(updated);
    } catch {
      if (!controller.signal.aborted) setMuteError("Pengaturan kanal belum terkonfirmasi. Muat ulang kanal.");
    } finally {
      if (write.current === controller) write.current = null;
      if (!controller.signal.aborted) setMuting(false);
    }
  }

  const label = selected ? selected.courseTitle ?? selected.title : courseId ? "Kanal mata kuliah" : "Semua kanal";
  return <View style={tutorLayout.group}>
    <View style={tutorLayout.cluster}>
      {!courseId ? <Button theme={theme} variant="outline" accessibilityLabel={`Pilih kanal, ${label}`}
        accessibilityState={{ expanded: open }} testID="tutor-discussion-channel-picker" onPress={() => setOpen(value => !value)}>{label}</Button> : null}
      {selected ? <>
        <Button theme={theme} variant="outline" isLoading={muting} disabled={Boolean(muteError)}
          testID="tutor-discussion-mute" onPress={() => void mute(selected)}>{selected.muted ? "Aktifkan notifikasi" : "Bisukan kanal"}</Button>
        {selected.kind === "course" || selected.kind === "global" ? <Button theme={theme} testID="tutor-discussion-create"
          onPress={() => { if (canInteract()) create(selected); }}>Pertanyaan baru</Button> : null}
      </> : null}
    </View>
    {muteError ? <View style={tutorLayout.group}>
      <Label theme={theme} tone="error">{muteError}</Label>
      <Button theme={theme} variant="outline" onPress={() => {
        apply.current(undefined);
        setSearch(""); setTerm(""); setCursor(undefined); setAttempt(value => value + 1); setMuteError("");
        if (!courseId) setOpen(true);
      }}>Muat ulang kanal</Button>
    </View> : null}
    {readError && (open || courseId) ? <Button theme={theme} variant="outline"
      onPress={() => setAttempt(value => value + 1)}>Coba muat kanal lagi</Button> : null}
    {open ? <View style={tutorLayout.group}>
      <Input theme={theme} accessibilityLabel="Cari kanal" placeholder="Cari kanal" maxLength={160}
        value={search} onChangeText={setSearch} onSubmitEditing={() => { setCursor(undefined); setTerm(search.trim()); }} />
      {search.trim() !== term ? <Button theme={theme} variant="outline" onPress={() => { setCursor(undefined); setTerm(search.trim()); }}>Cari kanal</Button> : null}
      {!loading && !readError ? <>
        <Row theme={theme} title="Semua kanal" onPress={() => { choose(undefined); setOpen(false); }} />
        {page?.items.map(channel => <Row key={channel.id} theme={theme} title={channel.courseTitle ?? channel.title}
          meta={channel.muted ? "Dibisukan" : undefined} onPress={() => { choose(channel); setOpen(false); }} />)}
        {cursor ? <Button theme={theme} variant="outline" onPress={() => setCursor(undefined)}>Kanal pertama</Button> : null}
        {page?.nextCursor ? <Button theme={theme} variant="outline" onPress={() => setCursor(page.nextCursor ?? undefined)}>Kanal berikutnya</Button> : null}
      </> : null}
    </View> : null}
    {loading && (open || courseId) ? <ActivityIndicator accessibilityLabel="Memuat kanal" /> : null}
  </View>;
}
