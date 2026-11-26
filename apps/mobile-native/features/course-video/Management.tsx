import { randomUUID } from "expo-crypto";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { ManagedPlaylist, ManagedVideo, ManagedVideoCommand, VideoManagementCatalog, VideoManagerRole } from "../../../../packages/course-video/management";
import { extractYouTubeVideoId } from "../../../../lib/video/youtube";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import type { NativeSessionTransport } from "../../network/transport";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { Action, CourseDialog, CourseTheme, DataRow, Field, Ink, layout, Picker } from "../academic/courses/ui";
import { readManagedVideos, submitManagedVideo, VideoManagementFailure, type VideoManagementAttempt } from "./management-client";

type Form = { kind: "playlist"; playlist?: ManagedPlaylist }
  | { kind: "video"; playlist: ManagedPlaylist; video?: ManagedVideo };
type Removal = { playlist: ManagedPlaylist; video?: ManagedVideo };
const unresolved = new WeakMap<NativeSessionTransport, Map<string, VideoManagementAttempt>>();

export function CourseVideoManagement({ role, courseId, theme, refresh }: {
  role: VideoManagerRole; courseId: string; theme: "light" | "dark"; refresh(): void;
}) {
  const { transport, revalidating } = useNativeSession();
  const { context } = useNativeAccountContext();
  const { canInteract } = useProtectedInteraction();
  const focused = useIsFocused();
  const [show, setShow] = useState(false);
  const available = Boolean(focused && !revalidating && transport?.isCurrent() && context?.roles.includes(role) &&
    context.accountId === transport.scope.accountId && context.sessionId === transport.scope.sessionId);
  useEffect(() => { if (!focused) setShow(false); }, [focused]);
  if (!transport || !context?.roles.includes(role)) return null;
  return <CourseTheme.Provider value={theme}>
    <View style={layout.row}>
      <Action label={context.locale === "en" ? "Manage videos" : "Kelola video"} disabled={!available}
        testID="native-course-video-management" onPress={() => { if (available && canInteract()) setShow(true); }} />
    </View>
    {show && focused ? <VideoManager key={JSON.stringify([transport.scope.sessionId, role, courseId])}
      session={transport} role={role} courseId={courseId} locale={context.locale} available={available} close={() => setShow(false)} refresh={refresh} /> : null}
  </CourseTheme.Provider>;
}

function VideoManager({ role, courseId, session, locale, available, close, refresh }: {
  role: VideoManagerRole; courseId: string; session: NativeSessionTransport; locale: string; available: boolean; close(): void; refresh(): void;
}) {
  const en = locale === "en";
  const tr = (id: string, english: string) => en ? english : id;
  const key = JSON.stringify([role, courseId]);
  const keep = (next?: VideoManagementAttempt) => {
    let entries = unresolved.get(session);
    if (!entries) {
      entries = new Map();
      unresolved.set(session, entries);
    }
    entries.delete(key);
    if (next) entries.set(key, next);
    while (entries.size > 12) entries.delete(entries.keys().next().value!);
  };
  const { canInteract } = useProtectedInteraction();
  const [data, setData] = useState<VideoManagementCatalog>();
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState<Form>();
  const [remove, setRemove] = useState<Removal>();
  const [attempt, setAttempt] = useState(() => unresolved.get(session)?.get(key));
  const [request, setRequest] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changed, setChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    setLoading(true);
    void readManagedVideos(session, role, courseId, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setData(undefined);
      if (error instanceof VideoManagementFailure && [401, 403, 404, 409].includes(error.status)) {
        setForm(undefined);
        setRemove(undefined);
        setAttempt(undefined);
        keep();
        setError(tr("Akses pengelolaan video tidak tersedia.", "Video management is unavailable."));
      } else setError(tr("Daftar video gagal dimuat.", "Could not load the video list."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [available, session, role, courseId, request, locale]);

  const playlist = data?.playlists.find(entry => entry.id === selected) ?? data?.playlists[0];
  const canEdit = Boolean(data && available && !loading && !busy && !attempt);

  async function submit(payload: VideoManagementAttempt) {
    if (running.current || !available || !canInteract()) return;
    const controller = new AbortController();
    running.current = controller;
    setError("");
    setNotice("");
    setAttempt(payload);
    keep(payload);
    setBusy(true);
    try {
      await submitManagedVideo(session, role, courseId, payload, controller.signal);
      if (controller.signal.aborted) return;
      setChanged(true);
      setForm(undefined);
      setRemove(undefined);
      setAttempt(undefined);
      keep();
      setNotice(tr("Perubahan tersimpan.", "Changes saved."));
      setRequest(value => value + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof VideoManagementFailure ? error.status : undefined;
      if (status !== undefined && [400, 401, 403, 404, 409, 415, 422].includes(status)) {
        setAttempt(undefined);
        keep();
        if (status !== 422 && status !== 400 && status !== 415) {
          setForm(undefined); setRemove(undefined);
          setRequest(value => value + 1);
        }
        setError(status === 409 ? tr("Daftar berubah. Tinjau data terbaru.", "The catalog changed. Review the latest data.")
          : status === 422 ? tr("Periksa judul, tujuan dan tautan video.", "Check the title, destination, and video link.")
          : tr("Aksi ini tidak tersedia sekarang.", "This action is currently unavailable."));
      } else setError(tr("Hasil perubahan belum terkonfirmasi.", "The change is unconfirmed."));
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function add(command: ManagedVideoCommand) { void submit({ requestId: randomUUID(), command }); }
  function leave() {
    if (running.current) return;
    close();
    if (changed) refresh();
  }

  return <CourseDialog title={tr("Kelola video", "Manage videos")} onClose={leave} dismissDisabled={busy} testID="native-course-video-manager-dialog">
    {notice ? <Ink>{notice}</Ink> : null}
    {error ? <Ink tone="error">{error}</Ink> : null}
    {!available || loading ? <Ink>{tr("Memeriksa akses…", "Checking access…")}</Ink> : null}
    {attempt ? <View style={layout.group}>
      <Action label={tr("Periksa perubahan", "Check this change")} onPress={() => void submit(attempt)} disabled={busy || !available} />
    </View> : null}
    {!data && available && !loading && !attempt ? <Action label={tr("Muat ulang", "Reload")} onPress={() => setRequest(value => value + 1)} /> : null}
    {data && available ? <>
      {form ? <CatalogForm form={form} catalog={data} locale={locale} disabled={!canEdit} cancel={() => setForm(undefined)} save={add} />
        : remove ? <View style={layout.group}>
          <Ink kind="strong">{remove.video?.title ?? remove.playlist.title}</Ink>
          {!remove.video ? <Ink>{tr(`Hapus daftar putar dan ${remove.playlist.videos.length} entri video?`, `Remove this playlist and ${remove.playlist.videos.length} video entries?`)}</Ink> : null}
          <View style={layout.row}>
            <Action label={tr("Hapus dari mata kuliah", "Remove from course")} variation="destructive" disabled={!canEdit}
              onPress={() => add(remove.video
                ? { action: "delete-video", id: remove.video.id, playlistId: remove.playlist.id, expectedRevision: remove.video.revision, confirmed: true }
                : { action: "delete-playlist", id: remove.playlist.id, expectedRevision: remove.playlist.revision, confirmed: true })} />
            <Action label={tr("Batal", "Cancel")} disabled={busy} onPress={() => setRemove(undefined)} />
          </View>
        </View> : <>
          <View style={layout.row}>
            <Action label={tr("Buat daftar putar", "Create playlist")} variation="default" disabled={!canEdit} onPress={() => setForm({ kind: "playlist" })} />
            {playlist ? <Action label={tr("Tambah video", "Add video")} disabled={!canEdit} onPress={() => setForm({ kind: "video", playlist })} /> : null}
          </View>
          {playlist ? <>
            <Picker label={tr("Daftar putar", "Playlist")} selected={playlist.id}
              options={data.playlists.map(item => ({ id: item.id, label: item.title }))} disabled={!canEdit} onSelect={setSelected} />
            <View style={layout.row}>
              <Action label={tr("Edit daftar putar", "Edit playlist")} disabled={!canEdit} onPress={() => setForm({ kind: "playlist", playlist })} />
              <Action label={tr("Hapus daftar putar", "Remove playlist")} variation="destructive" disabled={!canEdit}
                onPress={() => setRemove({ playlist })} />
            </View>
            {playlist.videos.map(video => <View key={video.id} style={layout.compact}>
              <DataRow title={video.title} description={video.description} />
              <View style={layout.row}>
                <Action label={tr("Edit video", "Edit video")} disabled={!canEdit} onPress={() => setForm({ kind: "video", playlist, video })} />
                <Action label={tr("Hapus video", "Remove video")} variation="destructive" disabled={!canEdit} onPress={() => setRemove({ playlist, video })} />
              </View>
            </View>)}
          </> : null}
        </>}
    </> : null}
  </CourseDialog>;
}

function CatalogForm({ form, catalog, locale, disabled, save, cancel }: {
  form: Form; catalog: VideoManagementCatalog; locale: string; disabled: boolean;
  save(command: ManagedVideoCommand): void; cancel(): void;
}) {
  const tr = (id: string, en: string) => locale === "en" ? en : id;
  const item = form.kind === "playlist" ? form.playlist : form.video;
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [playlistId, setPlaylistId] = useState(form.playlist?.id ?? "");
  const [chapterId, setChapterId] = useState(form.kind === "video" ? form.video?.chapterId ?? "" : "");
  const [source, setSource] = useState(form.kind === "video" && form.video ? "keep" : "youtube");
  const [youtube, setYoutube] = useState(form.kind === "video" ? form.video?.youtube ?? "" : "");

  function submit() {
    const basic = { title: title.trim(), description: description.trim() || null };
    if (form.kind === "playlist") {
      save(form.playlist ? { action: "edit-playlist", id: form.playlist.id, expectedRevision: form.playlist.revision, fields: basic }
        : { action: "new-playlist", fields: basic });
    } else {
      const fields = { ...basic, playlistId, chapterId: chapterId || null,
        source: source === "keep" ? { kind: "keep" as const } : { kind: "youtube" as const, video: youtube.trim() } };
      save(form.video ? { action: "edit-video", id: form.video.id, playlistId: form.playlist.id, expectedRevision: form.video.revision, fields }
        : { action: "new-video", fields });
    }
  }
  return <View style={layout.group}>
    <Field label={tr("Judul", "Title")} value={title} onChangeText={setTitle} editable={!disabled} maxLength={500} />
    <Field label={tr("Deskripsi", "Description")} value={description} onChangeText={setDescription} editable={!disabled} maxLength={10000} multiline />
    {form.kind === "video" ? <>
      <Picker label={tr("Daftar putar", "Playlist")} options={catalog.playlists.map(entry => ({ id: entry.id, label: entry.title }))}
        selected={playlistId} onSelect={setPlaylistId} disabled={disabled} />
      <Picker label={tr("Bab", "Chapter")} options={[{ id: "", label: tr("Tanpa bab", "No chapter") }, ...catalog.chapters.map(entry => ({ id: entry.id, label: entry.title }))]}
        selected={chapterId} onSelect={setChapterId} disabled={disabled} />
      <Picker label={tr("Sumber video", "Video source")} options={[
        ...(form.video ? [{ id: "keep", label: tr("Pertahankan video", "Keep current video") }] : []),
        { id: "youtube", label: "YouTube" },
      ]} selected={source} onSelect={setSource} disabled={disabled} />
      {source === "youtube" ? <Field label={tr("Tautan YouTube", "YouTube link")} value={youtube} onChangeText={setYoutube} keyboardType="url"
        autoCapitalize="none" editable={!disabled} maxLength={2048} /> : null}
    </> : null}
    <View style={layout.row}>
      <Action label={tr("Simpan", "Save")} variation="default" disabled={disabled || !title.trim() ||
        (form.kind === "video" && (!playlistId || source === "youtube" && !extractYouTubeVideoId(youtube)))} onPress={submit} />
      <Action label={tr("Batal", "Cancel")} disabled={disabled} onPress={cancel} />
    </View>
  </View>;
}
