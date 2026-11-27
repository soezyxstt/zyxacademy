import { randomUUID } from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { ManagementFailure, type MediaFile, type MediaLocation } from "../../../../../packages/native-parity/operations/management-contract";
import mediaEn from "../../../../../messages/en/adminMedia.json";
import mediaId from "../../../../../messages/id/adminMedia.json";
import { baseFolderName, filterMediaNames } from "../../../../../lib/media";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { mediaDestination, mediaSelection, runMediaBatch, type MediaItem, type MediaMutation } from "./media-batch";
import { MediaContentPreview } from "./media-preview";
import type { PickMediaFile } from "./media-upload";
import { Action, Choices, Confirm, Copy, Feedback, Field, Item, LoadState, Screen, Section, Sections, styles,
  useAction, useManagement, useRead, type Confirmation } from "./ui";

type Editor = { name: string; item?: MediaItem };
type CopySelection = { items: MediaItem[]; bulk: boolean; retry: boolean };
type BatchAction = { type: "media.delete" } | { type: "media.move" | "media.copy"; destination: string };
type Prepared = Extract<Awaited<ReturnType<PickMediaFile>>, { status: "ready" }>["file"];

export function MediaLibrary({ initialSpace }: { initialSpace?: string }) {
  const { client, retries, locale, pickMediaFile, theme } = useManagement();
  const { canInteract } = useProtectedInteraction();
  const activeRoute = useRef<symbol | null>(null);
  useFocusEffect(useCallback(() => {
    activeRoute.current = Symbol();
    return () => { activeRoute.current = null; };
  }, []));
  const [location, setLocation] = useState<MediaLocation>({ space: initialSpace === "storage" ? "storage" : "media", folder: "" });
  const { space, folder } = location;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<ComponentRef<typeof Button>>(null);
  const [editor, setEditor] = useState<Editor>();
  const [preview, setPreview] = useState<MediaFile>();
  const [selected, setSelected] = useState<MediaItem[] | null>(null);
  const [moving, setMoving] = useState<MediaItem[]>();
  const [copying, setCopying] = useState<CopySelection>();
  const [destination, setDestination] = useState("");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [upload, setUpload] = useState<{ file: Prepared; item?: MediaItem }>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [working, setWorking] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [client]);

  const read = useRead("media", location);
  const library = useRead("media", { space: "media", folder: "" }, Boolean(copying && space === "storage"));
  const action = useAction();
  const busy = working || action.busy;
  const isMedia = space === "media";
  const parent = folder.slice(0, folder.lastIndexOf("/"));
  const copyText = locale === "en" ? mediaEn : mediaId;
  const searchLabel = isMedia ? copyText.media.search : copyText.storage.search;
  const closeSearchLabel = locale === "en" ? "Close search" : "Tutup pencarian";
  const files = useMemo(() => filterMediaNames(read.data?.files ?? [], query, item => item.name), [read.data, query]);
  const folders = useMemo(() => filterMediaNames(read.data?.folders ?? [], query, baseFolderName), [read.data, query]);
  const targets = [["", "Pustaka media"], ...(read.data?.destinations ?? read.data?.folders ?? []).map(key => [key, key.slice(6)] as const)] as const;
  const options = moving ? targets.filter(([key]) => mediaDestination(moving, key)) : [];
  const copyOptions = copying
    ? (isMedia ? targets.filter(([key]) => mediaDestination(copying.items, key))
      : [["", "Pustaka media"], ...(library.data?.destinations ?? library.data?.folders ?? []).map(key => [key, key.slice(6)] as const)] as const) : [];

  function browse(next: MediaLocation) {
    if (busy) return;
    discardUpload();
    setPreview(undefined); setEditor(undefined); setSelected(null); setMoving(undefined); setCopying(undefined); setError(undefined); setMessage("");
    if (next.space !== space) { setQuery(""); setSearchOpen(false); }
    setLocation(next);
  }

  function closeSearch() {
    setQuery("");
    setSearchOpen(false);
    requestAnimationFrame(() => searchTrigger.current?.focus());
  }

  function toggle(item: MediaItem) {
    setSelected(previous => previous?.some(value => value.key === item.key)
      ? previous.filter(value => value.key !== item.key) : [...(previous ?? []), item]);
  }

  function move(items: MediaItem[]) {
    discardUpload();
    setCopying(undefined);
    const effective = mediaSelection(items);
    const first = targets.find(([key]) => mediaDestination(effective, key));
    setMoving(effective);
    setDestination(first?.[0] ?? "");
  }

  async function batch(items: MediaItem[], mutation: BatchAction) {
    if (operation.current || !activeRoute.current || !canInteract()) return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking(true); setError(undefined); setMessage("");
    const commands: MediaMutation[] = mediaSelection(items).map(item => mutation.type === "media.delete"
      ? { ...item, type: mutation.type } : { type: mutation.type, ...item, destination: mutation.destination });
    try {
      const result = await runMediaBatch(client, retries, commands, randomUUID, controller.signal);
      if (controller.signal.aborted) return;
      const count = result.failed.length;
      setMessage(`${result.succeeded} selesai${count ? `, ${count} belum selesai` : ""}.`);
      if (result.denied) setError(new ManagementFailure("forbidden"));
      else if (result.failed.some(entry => entry.uncertain)) setError(new ManagementFailure("uncertain"));
      const remaining = result.failed.map(({ item }) => item);
      setSelected(previous => previous ? remaining : null);
      setMoving(mutation.type === "media.move" && count ? remaining : undefined);
      if (mutation.type === "media.copy") {
        setCopying(count ? { items: remaining, bulk: true, retry: true } : undefined);
        if (!isMedia) library.reload();
      } else {
        read.reload();
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  function remove(items: MediaItem[]) {
    discardUpload();
    const count = mediaSelection(items).length;
    setConfirm({ title: count === 1 ? "Hapus dari media?" : `Hapus ${count} item?`,
      description: items.some(item => item.folder) ? "Folder yang dipilih akan dihapus beserta isinya." : "Berkas yang dipilih akan dihapus dari pustaka media.",
      label: "Hapus", danger: true, run: () => void batch(items, { type: "media.delete" }) });
  }

  function copy(items: MediaItem[], bulk = false) {
    if (!canInteract()) return;
    discardUpload();
    setMoving(undefined);
    setMessage("");
    setError(undefined);
    const effective = mediaSelection(items);
    setDestination(isMedia ? targets.find(([key]) => mediaDestination(effective, key))?.[0] ?? "" : "");
    setCopying({ items: effective, bulk, retry: false });
  }

  function submitCopy() {
    if (busy || !copying || !activeRoute.current || !canInteract()) return;
    if (copying.bulk) {
      void batch(copying.items, { type: "media.copy", destination });
      return;
    }
    void action.run({ type: "media.copy", ...copying.items[0], destination }, () => {
      setCopying(undefined);
      if (isMedia) read.reload();
    }, "Media disalin.");
  }

  function discardUpload() {
    operation.current?.abort();
    operation.current = null;
    upload?.file.release();
    setUpload(undefined);
  }

  async function choose(item?: MediaItem) {
    if (!pickMediaFile || busy || upload || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setEditor(undefined); setMoving(undefined);
    setWorking(true); setError(undefined); setMessage("");
    let ready = false;
    try {
      const result = await pickMediaFile(item ? { action: "replace", key: item.key } : { action: "upload", destination: folder },
        { route: "/admin/media", locale, draftId: randomUUID() }, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        ready = true;
        setUpload({ file: result.file, item });
      } else if (result.status === "error") {
        setError(new ManagementFailure(result.issue === "size" ? "payload-too-large" : result.issue === "type" ? "invalid" : "unavailable"));
      } else if (result.status === "unavailable") {
        setError(new ManagementFailure("unavailable"));
      }
    } catch {
      if (!controller.signal.aborted) setError(new ManagementFailure("unavailable"));
    } finally {
      if (!ready && operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  async function send() {
    const controller = operation.current;
    if (!upload || !controller || busy) return;
    setWorking(true); setError(undefined); setMessage("");
    try {
      await upload.file.send(controller.signal);
      if (controller.signal.aborted) return;
      discardUpload();
      setMessage(upload.item ? "Berkas diganti." : "Berkas diunggah.");
      read.reload();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure);
        if (failure instanceof ManagementFailure && !["uncertain", "pending", "unavailable"].includes(failure.code)) discardUpload();
      }
    } finally {
      setWorking(false);
    }
  }

  function rowActions(item: MediaItem, title: string) {
    if (selected) return <Action disabled={busy || Boolean(copying)} onPress={() => toggle(item)}>
      {selected.some(value => value.key === item.key) ? "Batal pilih" : "Pilih"}
    </Action>;
    if (!isMedia) return <Action disabled={busy} onPress={() => copy([item])}>Salin ke media</Action>;
    return <>
      <Action disabled={busy} onPress={() => { discardUpload(); setEditor({ item, name: title }); }}>Ganti nama</Action>
      <Action disabled={busy} onPress={() => move([item])}>Pindah</Action>
      <Action disabled={busy} onPress={() => copy([item])}>Salin</Action>
      {!item.folder && pickMediaFile && <Action disabled={busy || Boolean(upload)} onPress={() => void choose(item)}>Ganti berkas</Action>}
      <Action disabled={busy} variant="destructive" onPress={() => remove([item])}>Hapus</Action>
    </>;
  }

  return <Screen title="Media">
    <Sections values={[["media", "Pustaka media"], ["storage", "Penyimpanan"]]} current={space} onChange={next => browse({ space: next, folder: "" })} />
    {searchOpen ? <View style={[styles.row, { alignItems: "center", flexWrap: "nowrap" }]}>
      <Input testID="admin-media-search-query" autoFocus theme={theme} value={query} onChangeText={setQuery}
        accessibilityLabel={searchLabel} placeholder={searchLabel} autoCapitalize="none" returnKeyType="search" style={{ flex: 1 }}
        onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === "Escape") closeSearch(); }} />
      <Button theme={theme} size="icon-lg" variant="ghost" testID="admin-media-close-search" accessibilityLabel={closeSearchLabel}
        renderIcon={(color, size) => <NavigationIcon name="close" color={color} size={size} />}
        onPress={closeSearch} />
    </View> : <View style={styles.row}>
      <Button ref={searchTrigger} theme={theme} size="icon-lg" variant="outline" testID="admin-media-open-search" accessibilityLabel={searchLabel}
        renderIcon={(color, size) => <NavigationIcon name="search" color={color} size={size} />}
        onPress={() => { if (canInteract()) setSearchOpen(true); }} />
      {folder && <Action disabled={busy} onPress={() => browse({ space, folder: isMedia && parent === "media" ? "" : parent })}>Folder induk</Action>}
      <Action disabled={busy} onPress={read.reload}>Muat ulang</Action>
      {isMedia && <>
        {pickMediaFile && <Action disabled={busy || Boolean(upload)} onPress={() => void choose()}>Unggah</Action>}
        <Action disabled={busy} onPress={() => { discardUpload(); setEditor({ name: "" }); }}>Folder baru</Action>
      </>}
      <Action disabled={busy || Boolean(copying)} onPress={() => setSelected(selected ? null : [])}>{selected ? "Selesai memilih" : "Pilih item"}</Action>
    </View>}
    {folder && <Copy muted>{folder}</Copy>}
    <Feedback error={action.error} status={action.status} />
    {message && <Copy>{message}</Copy>}
    <Feedback error={error} />
    {upload && <Section title={upload.item ? "Ganti berkas" : "Unggah berkas"}>
      <Copy>{upload.item ? `${upload.file.name} menggantikan ${upload.item.key}.` : upload.file.name}</Copy>
      <View style={styles.row}>
        <Action disabled={busy} onPress={discardUpload}>Batal</Action>
        <Action variant="default" busy={working} onPress={() => void send()}>{error ? "Periksa unggahan" : upload.item ? "Ganti berkas" : "Unggah"}</Action>
      </View>
    </Section>}
    {editor && <Section title={editor.item ? "Ganti nama" : "Folder baru"}>
      <Field label="Nama" value={editor.name} onChangeText={name => setEditor({ ...editor, name })} />
      <View style={styles.row}><Action onPress={() => setEditor(undefined)}>Batal</Action>
        <Action variant="default" busy={action.busy} disabled={!editor.name.trim()} onPress={() => action.run(editor.item
          ? { type: "media.rename", ...editor.item, name: editor.name } : { type: "media.folder", folder, name: editor.name },
          () => { setEditor(undefined); read.reload(); })}>Simpan</Action>
      </View>
    </Section>}
    {selected && selected.length > 0 && <View style={styles.row}>
      <Copy>{selected.length} dipilih</Copy>
      {isMedia ? <>
        <Action disabled={busy} onPress={() => move(selected)}>Pindah pilihan</Action>
        <Action disabled={busy} variant="destructive" onPress={() => remove(selected)}>Hapus pilihan</Action>
      </> : <Action disabled={busy || Boolean(copying)} onPress={() => copy(selected, true)} testID="admin-storage-copy-selection">Salin pilihan ke media</Action>}
    </View>}
    {moving && <Section title="Folder tujuan">
      {options.length ? <Choices current={destination} values={options} onChange={setDestination} /> : <Copy>Folder tujuan belum tersedia.</Copy>}
      <View style={styles.row}>
        <Action disabled={busy} onPress={() => setMoving(undefined)}>Batal</Action>
        <Action variant="default" busy={working} disabled={!options.some(([key]) => key === destination)}
          onPress={() => void batch(moving, { type: "media.move", destination })}>Pindah</Action>
      </View>
    </Section>}
    {copying && <Section title="Salin ke folder">
      <Copy>{copying.bulk ? `${copying.items.length} item` : copying.items[0].key}</Copy>
      {!isMedia && <LoadState {...library} retry={library.reload} />}
      {copying.retry ? <Copy>{copyOptions.find(([key]) => key === destination)?.[1] ?? destination}</Copy>
        : copyOptions.length ? <Choices current={destination} values={copyOptions} onChange={value => { if (!busy) setDestination(value); }} />
        : !library.loading && <Copy>Folder tujuan belum tersedia.</Copy>}
      <View style={styles.row}>
        <Action disabled={busy} onPress={() => setCopying(undefined)}>Batal</Action>
        <Action variant="default" busy={busy} disabled={!copyOptions.some(([key]) => key === destination)}
          onPress={submitCopy} testID="admin-storage-submit-copy">{copying.retry ? "Coba lagi" : "Salin"}</Action>
      </View>
    </Section>}
    <LoadState {...read} retry={read.reload} />
    {read.data && <Section>
      {!files.length && !folders.length && <Copy muted>{query.trim() ? copyText.media.noResults : copyText.media.emptyFolder}</Copy>}
      {folders.map(key => {
        const title = baseFolderName(key);
        return <Item key={key} title={title} meta="Folder" onPress={() => browse({ space, folder: key })} actions={rowActions({ key, folder: true }, title)} />;
      })}
      {files.map(file => <Item key={file.key} title={file.name} meta={`${Math.ceil(file.size / 1024)} KB`}
        onPress={!busy && !selected ? () => { if (canInteract()) setPreview(file); } : undefined}
        actions={rowActions({ key: file.key, folder: false }, file.name)} />)}
    </Section>}
    {preview && <MediaContentPreview key={preview.key} file={preview} close={() => setPreview(undefined)} />}
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}
