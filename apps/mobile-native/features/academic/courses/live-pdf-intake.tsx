import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { View } from "react-native";
import { BATCH_MAX_FILES, BATCH_MAX_FILE_BYTES, detectMetadataFromFilename } from "../../../../../lib/course-batch-upload";
import { LEVEL1_CATEGORIES, getSubcategoriesForLevel1 } from "../../../../../lib/course-materials";
import {
  groupPdfIntake, pdfIntakeEntry, pdfIntakePath, type PdfIntakeEntry, type PdfIntakeDuplicate,
} from "../../../../../packages/native-parity/academic/courses/intake";
import type { DraftDocument } from "../../../device/file-controller";
import { scopedFiles } from "../../../device/files";
import { IntakeFailure, type PdfIntakeInput } from "./intake-client";
import { fingerprintPdf } from "./intake-device";
import { useIntakeDraft, useVerifiedIntakeSession, type VerifiedIntakeSession } from "./intake-scope";
import { Action, CourseDialog, CourseStatus, DataRow, Field, Ink, Picker, layout } from "./ui";

const pdfPolicy = { mimeTypes: ["application/pdf"], maxBytes: BATCH_MAX_FILE_BYTES };
const maxSelectionBytes = 200 * 1024 * 1024;
type Row = PdfIntakeInput & { duplicate?: PdfIntakeDuplicate; duplicateInBatch: boolean; skip: boolean; year: string };
type Props = { courseId: string; chapters: { id: string; title: string; orderIndex: number }[]; refresh(): void };

export function LivePdfIntake(props: Props) {
  const verified = useVerifiedIntakeSession();
  const [mode, setMode] = useState<"single" | "batch">();
  if (!verified) return null;
  return <>
    <View style={layout.row}>
      <Action label="Unggah PDF" onPress={() => { if (verified.ready()) setMode("single"); }} testID="admin-pdf-intake-single" />
      <Action label="Unggah banyak PDF" onPress={() => { if (verified.ready()) setMode("batch"); }} testID="admin-pdf-intake-batch" />
    </View>
    {mode ? <PdfIntakeEditor key={props.courseId + ":" + mode} {...props} session={verified} batch={mode === "batch"}
      close={() => setMode(undefined)} /> : null}
  </>;
}

function PdfIntakeEditor({ courseId, chapters, session, batch, refresh, close }: Props & {
  session: VerifiedIntakeSession; batch: boolean; close(): void;
}) {
  const openDraft = useIntakeDraft(session, courseId, pdfIntakePath + "?" + new URLSearchParams({ courseId }), pdfPolicy);
  const clientRef = useRef<NonNullable<ReturnType<typeof openDraft>> | null>(null);
  const pending = useRef<{ files: PdfIntakeInput[]; commit(): Promise<unknown> } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [unverified, setUnverified] = useState<DraftDocument[]>([]);
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const selectedRow = rows.find(row => row.entry.id === selected);

  async function run(task: () => Promise<void>) {
    if (active.current || !session.current() || !session.ready()) return;
    active.current = true;
    setBusy(true);
    setError("");
    try { await task(); }
    catch (failure) {
      if (!session.current()) return;
      if (failure instanceof IntakeFailure && [401, 403].includes(failure.status)) setError("Akses ditolak.");
      else if (failure instanceof IntakeFailure && failure.status === 409) {
        pending.current = null;
        const expired = failure.codes.includes("UPLOAD_EXPIRED");
        setError(expired ? "Izin unggah kedaluwarsa. Unggah kembali berkas yang tersisa."
          : "Dokumen di katalog sudah berubah. Pilih ulang PDF untuk memeriksa duplikat terbaru.");
      } else if (failure instanceof IntakeFailure && [400, 404, 413, 422].includes(failure.status)) {
        pending.current = null;
        setError("Periksa berkas PDF dan pilihan bab sebelum mencoba lagi.");
      } else {
        setError(pending.current ? "Status penyimpanan belum diketahui. Periksa penyimpanan dengan permintaan yang sama."
          : "PDF belum tersimpan. Periksa koneksi dan coba lagi.");
      }
    } finally { active.current = false; setBusy(false); setNotice(""); }
  }

  function update(row: Row) {
    setRows(current => current.map(item => item.entry.id === row.entry.id ? row : item));
    setError("");
  }

  function pick() {
    void run(async () => {
      const target = openDraft();
      if (!target) return;
      const result = await scopedFiles.pickDocuments(target.draft, batch
        ? { count: BATCH_MAX_FILES, bytes: maxSelectionBytes }
        : { count: 1, bytes: BATCH_MAX_FILE_BYTES });
      if (result.status !== "ready") {
        if (result.status === "error") setError(result.issue === "size"
          ? batch ? "Maks. 50 MB per PDF dan 200 MB per pilihan." : "Maks. 50 MB per PDF."
          : "Berkas PDF tidak dapat dibaca.");
        return;
      }
      if (!session.current() || target.draft.signal.aborted) {
        for (const document of result.documents) document.release();
        return;
      }
      for (const previous of [...unverified, ...rows.map(row => row.document)]) previous.release();
      setRows([]);
      setSelected(undefined);
      clientRef.current = target;
      setUnverified(result.documents);
    });
  }

  function checkDuplicates() {
    void run(async () => {
      const target = clientRef.current;
      if (!target) return;
      setNotice("Memeriksa duplikat...");
      const staged = [];
      for (const document of unverified) {
        if (!session.current() || target.draft.signal.aborted) return;
        staged.push({ document, checksum: await fingerprintPdf(document) });
      }
      const duplicates = await target.client.findDuplicates(staged.map(file => file.checksum));
      const seen = new Set<string>();
      const next = staged.map(({ document, checksum }): Row => {
        const metadata = detectMetadataFromFilename(document.name, chapters);
        const duplicate = duplicates[checksum];
        const duplicateInBatch = seen.has(checksum);
        seen.add(checksum);
        return { document, duplicate, duplicateInBatch, skip: Boolean(duplicate) || duplicateInBatch,
          year: metadata.year?.toString() ?? "",
          entry: {
            id: randomUUID(), filename: document.name, checksum, size: document.size,
            title: metadata.title, type: metadata.category, subcategory: metadata.subcategory,
            year: metadata.year, chapterIds: metadata.chapterIds, keepDuplicate: false, overwrite: null,
          },
        };
      });
      if (!session.current() || target.draft.signal.aborted) return;
      setRows(next);
      setSelected(next[0]?.entry.id);
      setUnverified([]);
    });
  }

  function save() {
    void run(async () => {
      const target = clientRef.current;
      if (!target) return;
      const queued: PdfIntakeInput[] = [];
      for (const row of rows.filter(item => !item.skip)) {
        const parsed = pdfIntakeEntry.safeParse({ ...row.entry, year: row.year ? Number(row.year) : null });
        if (!parsed.success || (row.year && !/^\d{4}$/.test(row.year))) {
          setSelected(row.entry.id);
          setError("Kelengkapi judul, tahun, dan bab yang terkait.");
          return;
        }
        queued.push({ entry: parsed.data, document: row.document });
      }
      const overwritten = queued.flatMap(file => file.entry.overwrite ? [file.entry.overwrite.id] : []);
      if (new Set(overwritten).size !== overwritten.length) {
        setError("Satu dokumen hanya dapat ditimpa sekali dalam satu unggahan.");
        return;
      }

      async function finishGroup(group: NonNullable<typeof pending.current>) {
        setNotice("Menyimpan PDF...");
        await group.commit();
        if (!session.current() || target!.draft.signal.aborted) throw new IntakeFailure(403);
        pending.current = null;
        const ids = new Set(group.files.map(file => file.entry.id));
        for (const file of group.files) file.document.release();
        setRows(current => current.filter(row => !ids.has(row.entry.id)));
        setSaved(count => count + ids.size);
        return ids;
      }

      const observed = pending.current ? await finishGroup(pending.current) : new Set<string>();
      for (const group of groupPdfIntake(queued.filter(file => !observed.has(file.entry.id)))) {
        setNotice("Mengunggah PDF...");
        const prepared = await target.client.preparePdfGroup(group, randomUUID());
        pending.current = { files: group, commit: prepared.commit };
        await finishGroup(pending.current);
      }
      for (const row of rows) row.document.release();
      close();
      refresh();
    });
  }

  return <CourseDialog title={batch ? "Unggah banyak PDF" : "Unggah PDF"} onClose={() => {
    close();
    if (saved || pending.current) refresh();
  }} dismissDisabled={busy} testID="course-pdf-intake-dialog">
    <Action label={rows.length || unverified.length ? "Pilih ulang PDF" : batch ? "Pilih beberapa PDF" : "Pilih PDF"} disabled={busy || Boolean(pending.current)}
      onPress={pick} testID="course-pdf-intake-pick" />
    {unverified.map(file => <DataRow key={file.uri} title={file.name} />)}
    {unverified.length ? <Action label="Periksa duplikat" onPress={checkDuplicates} disabled={busy}
      variation="default" testID="course-pdf-intake-duplicates" /> : null}
    {rows.map(row => <DataRow key={row.entry.id} title={row.document.name} description={row.duplicate?.title}
      detail={row.skip ? "Dilewati" : row.entry.overwrite ? "Timpa" : undefined} expanded={row.entry.id === selected}
      onPress={busy || pending.current ? undefined : () => setSelected(row.entry.id)} />)}
    {selectedRow ? <PdfMetadata row={selectedRow} chapters={chapters} disabled={busy || Boolean(pending.current)} update={update} /> : null}
    {saved ? <CourseStatus label={`${saved} PDF tersimpan.`} /> : null}
    {notice ? <CourseStatus label={notice} /> : null}
    {error ? <CourseStatus label={error} error /> : null}
    {rows.length ? <Action label={pending.current ? "Periksa penyimpanan" : "Unggah PDF"} disabled={busy || !rows.some(row => !row.skip)}
      onPress={save} variation="default" testID="course-pdf-intake-save" /> : null}
  </CourseDialog>;
}

function PdfMetadata({ row, chapters, disabled, update }: {
  row: Row; chapters: Props["chapters"]; disabled: boolean; update(row: Row): void;
}) {
  const { entry } = row;
  const duplicate = row.duplicate || row.duplicateInBatch;
  const patch = (delta: Partial<PdfIntakeEntry>) => update({ ...row, entry: { ...entry, ...delta } });
  return <>
    {duplicate ? <Picker label="Pilihan duplikat" disabled={disabled}
      selected={row.skip ? "skip" : entry.overwrite ? "overwrite" : "keep"}
      options={[{ id: "skip", label: "Lewati duplikat" }, { id: "keep", label: "Simpan salinan" },
        ...(row.duplicate ? [{ id: "overwrite", label: "Timpa dokumen di katalog" }] : [])]}
      onSelect={id => update({ ...row, skip: id === "skip",
        entry: { ...entry, keepDuplicate: id === "keep",
          overwrite: id === "overwrite" && row.duplicate ? { id: row.duplicate.materialId, revision: row.duplicate.revision } : null },
      })} /> : null}
    {!row.skip ? <>
      <Field label="Judul dokumen" value={entry.title} maxLength={255} disabled={disabled} onChangeText={title => patch({ title })} />
      <Picker label="Kategori" options={LEVEL1_CATEGORIES.map(item => ({ id: item.value, label: item.label }))}
        selected={entry.type} disabled={disabled} onSelect={id => patch({ type: id as PdfIntakeEntry["type"], subcategory: null })} />
      <Picker label="Subkategori" options={[{ id: "", label: "Tanpa subkategori" },
        ...getSubcategoriesForLevel1(entry.type).map(item => ({ id: item.value, label: item.label }))]}
        selected={entry.subcategory ?? ""} disabled={disabled} onSelect={id => patch({ subcategory: id || null })} />
      <Field label="Tahun" keyboardType="number-pad" value={row.year} maxLength={4}
        disabled={disabled} onChangeText={year => update({ ...row, year })} />
      <Ink kind="strong">Bab terkait</Ink>
      <View style={layout.row}>
        {chapters.map(chapter => {
          const checked = entry.chapterIds.includes(chapter.id);
          return <Action key={chapter.id} label={chapter.title} disabled={disabled} selected={checked} onPress={() =>
            patch({ chapterIds: checked ? entry.chapterIds.filter(id => id !== chapter.id) : [...entry.chapterIds, chapter.id] })} />;
        })}
      </View>
    </> : null}
  </>;
}
