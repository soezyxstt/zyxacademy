import { randomUUID } from "expo-crypto";
import type { VideoPlayer } from "expo-video";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import type { ManagedPlaylist, ManagedVideo, ManagedVideoCommand, VideoFields, VideoManagementCatalog, VideoManagerRole, VideoUploadKind } from "../../../../packages/course-video/management";
import { extractYouTubeVideoId } from "../../../../lib/video/youtube";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import type { DraftDocument } from "../../device/file-controller";
import type { NativeSessionTransport } from "../../network/transport";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { Action, CourseDialog, CourseTheme, DataRow, Field, Ink, layout, Picker } from "../academic/courses/ui";
import { readManagedVideos, readYouTubeVideoTitle, submitManagedVideo, VideoManagementFailure, type VideoManagementAttempt } from "./management-client";
import { VideoCoverPreview } from "./VideoCoverPreview";
import { pickCourseVideoAsset, uploadCourseCoverFrame, uploadCourseVideoAsset } from "./management-upload";

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
  const previous = useRef<{ transport: NativeSessionTransport; locale: "id" | "en" } | null>(null);
  const verified = transport && context?.roles.includes(role) &&
    context.accountId === transport.scope.accountId && context.sessionId === transport.scope.sessionId;
  if (verified && transport && context) previous.current = { transport, locale: context.locale === "en" ? "en" : "id" };
  else if (!revalidating || previous.current?.transport !== transport) previous.current = null;
  const available = Boolean(focused && !revalidating && transport?.isCurrent() && verified);
  useEffect(() => { if (!focused) setShow(false); }, [focused]);
  const scope = previous.current;
  if (!transport || !scope) return null;
  return <CourseTheme.Provider value={theme}>
    <View style={layout.row}>
      <Action label={scope.locale === "en" ? "Manage videos" : "Kelola video"} disabled={!available}
        testID="native-course-video-management" onPress={() => { if (available && canInteract()) setShow(true); }} />
    </View>
    {show && focused ? <VideoManager key={JSON.stringify([transport.scope.sessionId, role, courseId])}
      session={transport} role={role} courseId={courseId} locale={scope.locale} available={available} close={() => setShow(false)} refresh={refresh} /> : null}
  </CourseTheme.Provider>;
}

function VideoManager({ role, courseId, session, locale, available, close, refresh }: {
  role: VideoManagerRole; courseId: string; session: NativeSessionTransport; locale: "id" | "en"; available: boolean; close(): void; refresh(): void;
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
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    setLoading(true);
    void readManagedVideos(session, role, courseId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setReadFailed(false); }
    }).catch(error => {
      if (controller.signal.aborted) return;
      setReadFailed(true);
      if (error instanceof VideoManagementFailure && [401, 403, 404, 409].includes(error.status)) {
        setData(undefined);
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
  const canEdit = Boolean(data && available && !loading && !busy && !attempt && !readFailed);

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
      const fields = payload.command.action === "new-video" || payload.command.action === "edit-video" ? payload.command.fields : undefined;
      const uploaded = fields?.source.kind === "uploaded" || fields?.thumbnail?.kind === "uploaded";
      if (status !== undefined && [400, 401, 403, 404, 409, 415, 422].includes(status)) {
        setAttempt(undefined);
        keep();
        if (status !== 422 && status !== 400 && status !== 415) {
          setForm(undefined); setRemove(undefined);
          setRequest(value => value + 1);
        }
        setError(status === 409 ? tr("Daftar berubah. Tinjau data terbaru.", "The catalog changed. Review the latest data.")
          : status === 422 && uploaded ? tr("Unggahan belum dapat dipakai. Pilih berkas lalu unggah kembali.", "The upload is unavailable. Choose the file and upload it again.")
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
    {(!data || readFailed) && available && !loading && !attempt ? <Action label={tr("Muat ulang", "Reload")} onPress={() => setRequest(value => value + 1)} /> : null}
    {form && data ? <View style={!available ? { display: "none" } : undefined}>
      <CatalogForm form={form} catalog={data} locale={locale} session={session} role={role} courseId={courseId}
        disabled={!canEdit} cancel={() => setForm(undefined)} save={add} />
    </View> : null}
    {!form && data && available && !readFailed ? <>
      {remove ? <View style={layout.group}>
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

function CatalogForm({ form, catalog, locale, session, role, courseId, disabled, save, cancel }: {
  form: Form; catalog: VideoManagementCatalog; locale: "id" | "en"; disabled: boolean;
  session: NativeSessionTransport; role: VideoManagerRole; courseId: string;
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
  const [files, setFiles] = useState<Partial<Record<VideoUploadKind, DraftDocument>>>({});
  const selectedFiles = useRef(files);
  const player = useRef<VideoPlayer | null>(null);
  const [coverSecond, setCoverSecond] = useState<number>();
  const [resetThumbnail, setResetThumbnail] = useState(false);
  const [activity, setActivity] = useState<"pick" | "metadata" | VideoUploadKind>();
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const { canInteract } = useProtectedInteraction();
  const scope = { session, role, courseId, locale };
  const device = Platform.OS === "android" || Platform.OS === "ios";
  const locked = disabled || Boolean(activity);
  useEffect(() => () => {
    active.current?.abort();
    for (const file of Object.values(selectedFiles.current)) file?.release();
  }, []);

  function replaceFile(kind: VideoUploadKind, file?: DraftDocument) {
    selectedFiles.current[kind]?.release();
    selectedFiles.current = { ...selectedFiles.current, [kind]: file };
    setFiles(selectedFiles.current);
  }

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (!canInteract() || locked || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setError("");
    try { await work(controller.signal); }
    catch {
      if (!controller.signal.aborted) setError(tr("Berkas belum diproses. Coba lagi.", "Could not process the file. Try again."));
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setActivity(undefined);
    }
  }

  function pick(kind: VideoUploadKind) {
    void run(async signal => {
      setActivity("pick");
      const result = await pickCourseVideoAsset(scope, kind, signal);
      if (result.status === "ready") {
        if (signal.aborted) { result.document.release(); return; }
        replaceFile(kind, result.document);
        setCoverSecond(undefined);
        if (kind === "thumbnail") setResetThumbnail(false);
        if (kind === "video" && !title.trim()) setTitle(result.document.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 500));
      } else if (result.status !== "cancelled" && result.status !== "stale") {
        setError(kind === "video" ? tr("Pilih video yang didukung hingga 100 MB.", "Choose a supported video up to 100 MB.")
          : tr("Pilih JPG, PNG, atau WebP hingga 5 MB.", "Choose a JPG, PNG, or WebP up to 5 MB."));
      }
    });
  }

  function submit() {
    const basic = { title: title.trim(), description: description.trim() || null };
    if (form.kind === "playlist") {
      save(form.playlist ? { action: "edit-playlist", id: form.playlist.id, expectedRevision: form.playlist.revision, fields: basic }
        : { action: "new-playlist", fields: basic });
      return;
    }
    const target = form;
    void run(async signal => {
      let selectedSource: VideoFields["source"] = source === "keep" ? { kind: "keep" } : { kind: "youtube", video: youtube.trim() };
      let thumbnail: VideoFields["thumbnail"] = resetThumbnail ? { kind: "default" } : undefined;
      if (source === "upload" && files.video) {
        setActivity("video");
        const duration = player.current?.duration;
        const seconds = duration && Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration)) : undefined;
        if (coverSecond !== undefined && !files.thumbnail && !resetThumbnail) {
          if (!player.current) throw new VideoManagementFailure(422);
          thumbnail = { kind: "uploaded", token: await uploadCourseCoverFrame(scope, files.video, player.current, coverSecond, signal) };
        }
        selectedSource = { kind: "uploaded", duration: seconds, token: await uploadCourseVideoAsset(scope, "video", files.video, signal) };
      }
      if (files.thumbnail) {
        setActivity("thumbnail");
        thumbnail = { kind: "uploaded", token: await uploadCourseVideoAsset(scope, "thumbnail", files.thumbnail, signal) };
      }
      if (signal.aborted || !session.isCurrent()) return;
      const fields = { ...basic, playlistId, chapterId: chapterId || null, source: selectedSource, thumbnail };
      save(target.video ? { action: "edit-video", id: target.video.id, playlistId: target.playlist.id, expectedRevision: target.video.revision, fields }
        : { action: "new-video", fields });
    });
  }
  return <View style={layout.group}>
    {error ? <Ink tone="error">{error}</Ink> : null}
    <Field label={tr("Judul", "Title")} value={title} onChangeText={setTitle} editable={!locked} maxLength={500} />
    <Field label={tr("Deskripsi", "Description")} value={description} onChangeText={setDescription} editable={!locked} maxLength={10000} multiline />
    {form.kind === "video" ? <>
      <Picker label={tr("Daftar putar", "Playlist")} options={catalog.playlists.map(entry => ({ id: entry.id, label: entry.title }))}
        selected={playlistId} onSelect={setPlaylistId} disabled={locked} />
      <Picker label={tr("Bab", "Chapter")} options={[{ id: "", label: tr("Tanpa bab", "No chapter") }, ...catalog.chapters.map(entry => ({ id: entry.id, label: entry.title }))]}
        selected={chapterId} onSelect={setChapterId} disabled={locked} />
      <Picker label={tr("Sumber video", "Video source")} options={[
        ...(form.video ? [{ id: "keep", label: tr("Pertahankan video", "Keep current video") }] : []),
        { id: "youtube", label: "YouTube" },
        ...(device ? [{ id: "upload", label: tr("Unggah berkas", "Upload a file") }] : []),
      ]} selected={source} onSelect={setSource} disabled={locked} />
      {source === "youtube" ? <>
        <Field label={tr("Tautan YouTube", "YouTube link")} value={youtube} onChangeText={setYoutube} keyboardType="url"
          autoCapitalize="none" editable={!locked} maxLength={2048} />
        <View style={layout.row}><Action label={tr("Ambil judul dari YouTube", "Get title from YouTube")}
          disabled={locked || !extractYouTubeVideoId(youtube)} onPress={() => void run(async signal => {
            const id = extractYouTubeVideoId(youtube);
            if (!id) return;
            setActivity("metadata");
            try {
              const title = await readYouTubeVideoTitle(session, role, courseId, id, signal);
              if (!signal.aborted) setTitle(title);
            } catch {
              if (!signal.aborted) setError(tr("Judul YouTube tidak tersedia.", "The YouTube title is unavailable."));
            }
          })} /></View>
      </> : null}
      {source === "upload" ? <View style={layout.row}>
        <Action label={tr("Pilih video", "Choose video")} onPress={() => pick("video")} disabled={locked} />
        {files.video ? <Ink>{files.video.name}</Ink> : null}
      </View> : null}
      {source === "upload" && files.video && <VideoCoverPreview key={files.video.uri} uri={files.video.uri} handle={player} locale={locale} disabled={locked}
        select={second => { replaceFile("thumbnail"); setResetThumbnail(false); setCoverSecond(second); }} selected={coverSecond} />}
      {device ? <View style={layout.row}>
        <Action label={tr("Pilih gambar sampul", "Choose thumbnail")} onPress={() => pick("thumbnail")} disabled={locked} />
        {files.thumbnail ? <Ink>{files.thumbnail.name}</Ink> : null}
        {(files.thumbnail || coverSecond !== undefined || form.video) && !resetThumbnail ? <Action label={tr("Gunakan gambar bawaan", "Use default thumbnail")}
          onPress={() => { replaceFile("thumbnail"); setCoverSecond(undefined); setResetThumbnail(true); }} disabled={locked} /> : null}
      </View> : null}
    </> : null}
    <View style={layout.row}>
      <Action label={activity === "video" ? tr("Mengunggah video…", "Uploading video…")
        : activity === "thumbnail" ? tr("Mengunggah sampul…", "Uploading thumbnail…") : tr("Simpan", "Save")}
        variation="default" disabled={locked || !title.trim() ||
        (form.kind === "video" && (!playlistId || source === "youtube" && !extractYouTubeVideoId(youtube) || source === "upload" && !files.video))}
        onPress={submit} />
      <Action label={tr("Batal", "Cancel")} disabled={disabled} onPress={cancel} />
    </View>
  </View>;
}
