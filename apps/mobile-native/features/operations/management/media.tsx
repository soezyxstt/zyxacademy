import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ManagementFailure, type MediaLocation } from "../../../../../packages/native-parity/operations/management-contract";
import { mediaDestination, mediaSelection, runMediaBatch, type MediaItem } from "./media-batch";
import type { PickMediaFile } from "./media-upload";
import { Action, Choices, Confirm, Copy, Feedback, Field, Item, LoadState, Screen, Section, Sections, styles,
  useAction, useManagement, useRead, type Confirmation } from "./ui";

type Editor = { name: string; item?: MediaItem };
type Prepared = Extract<Awaited<ReturnType<PickMediaFile>>, { status: "ready" }>["file"];

export function MediaLibrary({ initialSpace }: { initialSpace?: string }) {
  const { client, retries, locale, openExternal, pickMediaFile } = useManagement();
  const [location, setLocation] = useState<MediaLocation>({ space: initialSpace === "storage" ? "storage" : "media", folder: "" });
  const { space, folder } = location;
  const [editor, setEditor] = useState<Editor>();
  const [selected, setSelected] = useState<MediaItem[] | null>(null);
  const [moving, setMoving] = useState<MediaItem[]>();
  const [destination, setDestination] = useState("");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [upload, setUpload] = useState<{ file: Prepared; item?: MediaItem }>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [working, setWorking] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [client]);

  const read = useRead("media", location);
  const action = useAction();
  const busy = working || action.busy;
  const isMedia = space === "media";
  const parent = folder.slice(0, folder.lastIndexOf("/"));
  const targets = [["", "Pustaka media"], ...(read.data?.destinations ?? read.data?.folders ?? []).map(key => [key, key.slice(6)] as const)] as const;
  const options = moving ? targets.filter(([key]) => mediaDestination(moving, key)) : [];

  function browse(next: MediaLocation) {
    if (busy) return;
    discardUpload();
    setEditor(undefined); setSelected(null); setMoving(undefined); setError(undefined); setMessage("");
    setLocation(next);
  }

  function toggle(item: MediaItem) {
    setSelected(previous => previous?.some(value => value.key === item.key)
      ? previous.filter(value => value.key !== item.key) : [...(previous ?? []), item]);
  }

  function move(items: MediaItem[]) {
    discardUpload();
    const effective = mediaSelection(items);
    const first = targets.find(([key]) => mediaDestination(effective, key));
    setMoving(effective);
    setDestination(first?.[0] ?? "");
  }

  async function batch(items: MediaItem[], target?: string) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setWorking(true); setError(undefined); setMessage("");
    const commands = mediaSelection(items).map(item => target === undefined ? ({ ...item, type: "media.delete" } as const)
      : ({ ...item, type: "media.move", destination: target } as const));
    try {
      const result = await runMediaBatch(client, retries, commands, randomUUID, controller.signal);
      if (controller.signal.aborted) return;
      const count = result.failed.length;
      setMessage(`${result.succeeded} selesai${count ? `, ${count} belum selesai` : ""}.`);
      if (result.failed.some(entry => entry.uncertain)) setError(new ManagementFailure("uncertain"));
      setSelected(current => current ? result.failed.map(({ item }) => item) : null);
      setMoving(target !== undefined && count ? result.failed.map(({ item }) => item) : undefined);
      read.reload();
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
      label: "Hapus", danger: true, run: () => void batch(items) });
  }

  function copy(item: MediaItem) {
    setConfirm({ title: "Salin ke media?", description: `${item.key} akan disalin ke pustaka media.`, label: "Salin",
      run: () => void action.run({ type: "media.copy", ...item, destination: "" }, undefined, "Media disalin.") });
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
    if (!isMedia) return <Action disabled={busy} onPress={() => copy(item)}>Salin ke media</Action>;
    if (selected) return <Action disabled={busy} onPress={() => toggle(item)}>
      {selected.some(value => value.key === item.key) ? "Batal pilih" : "Pilih"}
    </Action>;
    return <>
      <Action disabled={busy} onPress={() => { discardUpload(); setEditor({ item, name: title }); }}>Ganti nama</Action>
      <Action disabled={busy} onPress={() => move([item])}>Pindah</Action>
      {!item.folder && pickMediaFile && <Action disabled={busy || Boolean(upload)} onPress={() => void choose(item)}>Ganti berkas</Action>}
      <Action disabled={busy} variant="destructive" onPress={() => remove([item])}>Hapus</Action>
    </>;
  }

  return <Screen title="Media">
    <Sections values={[["media", "Pustaka media"], ["storage", "Penyimpanan"]]} current={space} onChange={next => browse({ space: next, folder: "" })} />
    <View style={styles.row}>
      {folder && <Action disabled={busy} onPress={() => browse({ space, folder: isMedia && parent === "media" ? "" : parent })}>Folder induk</Action>}
      <Action disabled={busy} onPress={read.reload}>Muat ulang</Action>
      {isMedia && <>
        {pickMediaFile && <Action disabled={busy || Boolean(upload)} onPress={() => void choose()}>Unggah</Action>}
        <Action disabled={busy} onPress={() => { discardUpload(); setEditor({ name: "" }); }}>Folder baru</Action>
        <Action disabled={busy} onPress={() => setSelected(selected ? null : [])}>{selected ? "Selesai memilih" : "Pilih item"}</Action>
      </>}
    </View>
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
      <Action disabled={busy} onPress={() => move(selected)}>Pindah pilihan</Action>
      <Action disabled={busy} variant="destructive" onPress={() => remove(selected)}>Hapus pilihan</Action>
    </View>}
    {moving && <Section title="Folder tujuan">
      {options.length ? <Choices current={destination} values={options} onChange={setDestination} /> : <Copy>Folder tujuan belum tersedia.</Copy>}
      <View style={styles.row}>
        <Action disabled={busy} onPress={() => setMoving(undefined)}>Batal</Action>
        <Action variant="default" busy={working} disabled={!options.some(([key]) => key === destination)}
          onPress={() => void batch(moving, destination)}>Pindah</Action>
      </View>
    </Section>}
    <LoadState {...read} retry={read.reload} />
    {read.data && <Section>
      {!read.data.files.length && !read.data.folders.length && <Copy muted>Folder ini masih kosong.</Copy>}
      {read.data.folders.map(key => {
        const title = key.split("/").at(-1) ?? key;
        return <Item key={key} title={title} meta="Folder" onPress={() => browse({ space, folder: key })} actions={rowActions({ key, folder: true }, title)} />;
      })}
      {read.data.files.map(file => <Item key={file.key} title={file.name} meta={`${Math.ceil(file.size / 1024)} KB`}
        onPress={file.url && openExternal ? () => openExternal(file.url!) : undefined} actions={rowActions({ key: file.key, folder: false }, file.name)} />)}
    </Section>}
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}
