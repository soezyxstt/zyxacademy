import { useState } from "react";
import { View } from "react-native";
import type {
  AdminFlashcardDraft, AdminFlashcardEditor, AdminFlashcardSetDraft, AdminFlashcardStatus, CourseWriteTarget,
} from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { LiveCourseDelete } from "./live-delete";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, DataRow, Field, Ink, Picker, SearchBox, layout } from "./ui";

type Flashcards = Extract<AdminCourseSectionResult, { type: "flashcards" }>;
type FlashcardSet = Flashcards["sets"][number];
type Flashcard = FlashcardSet["cards"][number];
type FormProps<Draft> = { title: string; initial: Draft; target: CourseWriteTarget<Draft>; close(): void; refresh(): void };
type Editor = { kind: "set"; set?: FlashcardSet } | { kind: "card"; set: FlashcardSet; card?: Flashcard };

const statusLabel = {
  draft: "Draf", in_review: "Dalam tinjauan", published: "Terbit", retired: "Diarsipkan",
};
const publicationOptions = [
  { id: "published", label: statusLabel.published },
  { id: "draft", label: statusLabel.draft },
  { id: "retired", label: statusLabel.retired },
] as const;

export function LiveFlashcards({ data, editor, refresh }: { data: Flashcards; editor?: AdminFlashcardEditor; refresh(): void }) {
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editor | null>(null);
  const writable = data.writable && editor;
  const courseId = data.course.id;
  const aliases = new Map(data.chapters.flatMap(({ id, legacyId }) => legacyId ? [[legacyId, id] as const] : []));
  const chapterOptions = new Map([...(data.legacyChapters ?? []).filter(({ id }) => !aliases.has(id)), ...data.chapters]
    .map(({ id, title }) => [id, title]));
  const matchesChapter = (id: string | null) => !chapter || (chapter === "unassigned" ? !id : Boolean(id && (aliases.get(id) ?? id) === chapter));
  const term = search.trim().toLocaleLowerCase("id");
  const sets = data.sets.filter(set =>
    matchesChapter(set.chapterId) &&
    (!status || set.status === status) &&
    (set.title.toLocaleLowerCase("id").includes(term) || set.cards.some(card => `${card.front} ${card.back}`.toLocaleLowerCase("id").includes(term))));
  const close = () => setEditing(null);

  return <>
    <SearchBox label="Cari set atau kartu" value={search} onChange={setSearch} />
    <View style={layout.row}>
      {chapterOptions.size ? <Picker label="Filter bab" compact options={[
        { id: "", label: "Semua bab" }, { id: "unassigned", label: "Tanpa bab" },
        ...Array.from(chapterOptions, ([id, label]) => ({ id, label })),
      ]} selected={chapter} onSelect={setChapter} /> : null}
      <Picker label="Filter status" compact options={[
        { id: "", label: "Semua status" }, ...publicationOptions, { id: "in_review", label: statusLabel.in_review },
      ]} selected={status} onSelect={setStatus} />
      {writable && data.canCreateSet ? <Action label={writable.saveSet(courseId).pending() ? "Periksa set baru" : "Buat set"}
        variation="default" onPress={() => setEditing({ kind: "set" })} testID="course-flashcard-create-set" /> : null}
    </View>
    {sets.length ? sets.map(set => <View key={set.id}>
      <DataRow title={set.title} description={statusLabel[set.status]} detail={`${set.cards.length} kartu`} expanded={open === set.id}
        onPress={() => setOpen(open === set.id ? null : set.id)} />
      {open === set.id ? <View style={layout.group}>
        {writable ? <View style={layout.row}>
          <Action label={writable.saveCard(courseId, set.id).pending() ? "Periksa kartu baru" : "Tambah kartu"}
            onPress={() => setEditing({ kind: "card", set })} />
          {set.revision ? <Action label={writable.saveSet(courseId, set.id).pending() ? "Periksa perubahan set" : "Edit set"}
            onPress={() => setEditing({ kind: "set", set })} /> : null}
          {set.deleteRevision ? <LiveCourseDelete label="Hapus set" name={set.title}
            detail={`Penghapusan juga menghapus ${set.cards.length} kartu.`}
            dependencyError="Set ini memiliki kartu atau riwayat belajar terkait. Ubah status terbit untuk menyembunyikannya."
            revision={set.deleteRevision} target={writable.remove(courseId, set.id)} refresh={refresh} /> : null}
        </View> : null}
        {set.cards.map(card => <View key={card.id} style={layout.compact}>
          <DataRow title={card.front} detail={card.status ? statusLabel[card.status] : undefined} expanded={cardId === card.id}
            onPress={() => setCardId(cardId === card.id ? null : card.id)} />
          {cardId === card.id ? <>
            <Ink>{card.back}</Ink>
            {card.explanation ? <Ink tone="muted">{card.explanation}</Ink> : null}
            {writable && card.revision ? <View style={layout.row}>
              <Action label={writable.saveCard(courseId, set.id, card.id).pending() ? "Periksa perubahan kartu" : "Edit kartu"}
                onPress={() => setEditing({ kind: "card", set, card })} />
              <LiveCourseDelete label="Hapus kartu" name={card.front} detail="Kartu ini akan dihapus permanen."
                dependencyError="Kartu ini memiliki riwayat belajar. Ubah status terbit untuk menyembunyikannya."
                revision={card.revision} target={writable.remove(courseId, set.id, card.id)} refresh={refresh} />
            </View> : null}
          </> : null}
        </View>)}
      </View> : null}
    </View>) : <CourseStatus label="Tidak ada set pada pilihan ini." />}
    {editing?.kind === "set" && writable ? <SetForm title={editing.set ? "Edit set kartu" : "Buat set kartu"}
      close={close} refresh={refresh} target={writable.saveSet(courseId, editing.set?.id)}
      chapterOptions={editing.set?.projection === "legacy" ? data.legacyChapters ?? [] : data.chapters}
      chapterRequired={editing.set?.projection === "legacy"}
      initial={{
        title: editing.set?.title ?? "", chapterId: editing.set?.chapterId ?? null,
        status: editing.set?.status === "in_review" ? "draft" : editing.set?.status ?? "published",
        expectedRevision: editing.set?.revision ?? null,
      }} /> : null}
    {editing?.kind === "card" && writable ? <CardForm legacy={editing.set.projection === "legacy"} title={editing.card ? "Edit kartu" : "Tambah kartu"}
      close={close} refresh={refresh} target={writable.saveCard(courseId, editing.set.id, editing.card?.id)}
      setOptions={eligibleCardSets(data.sets, editing.set, editing.card)}
      initial={{
        front: editing.card?.front ?? "", back: editing.card?.back ?? "", explanation: editing.card?.explanation ?? null,
        status: editing.card?.status ?? "published", targetSetId: editing.set.id, expectedRevision: editing.card?.revision ?? null,
      }} /> : null}
  </>;
}

function eligibleCardSets(sets: FlashcardSet[], source: FlashcardSet, card?: Flashcard) {
  if (!card) return [source];
  if (source.projection === "legacy") return sets.filter(set => set.projection !== "canonical");
  if (card.mirrored) return sets.filter(set => set.projection === "mirrored");
  return sets.filter(set => set.projection !== "legacy");
}

function StatusPicker({ current, editing, disabled, onSelect }: {
  current: AdminFlashcardStatus; editing: boolean; disabled: boolean; onSelect(next: AdminFlashcardStatus): void;
}) {
  return <Picker label="Status terbit" compact options={editing ? publicationOptions : publicationOptions.slice(0, 2)}
    selected={current} onSelect={id => onSelect(id as AdminFlashcardStatus)} disabled={disabled} />;
}

function SetForm({ title, initial, target, close, refresh, chapterOptions, chapterRequired }: FormProps<AdminFlashcardSetDraft> & {
  chapterOptions: Flashcards["chapters"]; chapterRequired?: boolean;
}) {
  const [draft, setDraft] = useState(() => target.pending()?.draft ?? initial);
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  const options = chapterOptions.map(({ id, title: label }) => ({ id, label }));
  if (!chapterRequired) options.unshift({ id: "", label: "Tanpa bab" });
  if (draft.chapterId && !options.some(({ id }) => id === draft.chapterId)) {
    options.push({ id: draft.chapterId, label: "Bab saat ini" });
  }
  const update = (change: Partial<AdminFlashcardSetDraft>) => { setDraft(previous => ({ ...previous, ...change })); mutation.setStatus(null); };

  return <CourseDialog title={title} onClose={close} dismissDisabled={mutation.busy}>
    <Field label="Judul set" value={draft.title} maxLength={500} onChangeText={value => update({ title: value })}
      disabled={!mutation.editable} testID="course-flashcard-set-title" />
    <Picker label="Bab untuk set" compact options={options} selected={draft.chapterId ?? ""} disabled={!mutation.editable}
      onSelect={id => update({ chapterId: id || null })} />
    <StatusPicker current={draft.status} editing={Boolean(draft.expectedRevision)} disabled={!mutation.editable}
      onSelect={status => update({ status })} />
    <WriteFeedback mutation={mutation} reload={reload} invalid="Periksa judul atau bab yang dipilih." />
    <FormActions busy={mutation.busy} enabled={mutation.editable && Boolean(draft.title.trim()) && (!chapterRequired || Boolean(draft.chapterId))}
      close={close} submit={() => mutation.submit({ ...draft, title: draft.title.trim() })} />
  </CourseDialog>;
}

function CardForm({ title, initial, target, close, refresh, setOptions, legacy }: FormProps<AdminFlashcardDraft> & { setOptions: FlashcardSet[]; legacy: boolean }) {
  const [draft, setDraft] = useState(() => target.pending()?.draft ?? initial);
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  const update = (change: Partial<AdminFlashcardDraft>) => { setDraft(previous => ({ ...previous, ...change })); mutation.setStatus(null); };

  return <CourseDialog title={title} onClose={close} dismissDisabled={mutation.busy}>
    <Picker label="Set untuk kartu" compact options={setOptions.map(({ id, title: label }) => ({ id, label }))}
      selected={draft.targetSetId} onSelect={id => update({ targetSetId: id })} disabled={!mutation.editable || setOptions.length < 2} />
    <StatusPicker current={draft.status} editing={Boolean(draft.expectedRevision) && !legacy} disabled={!mutation.editable}
      onSelect={status => update({ status })} />
    <Field label="Pertanyaan" value={draft.front} multiline maxLength={10_000} disabled={!mutation.editable}
      onChangeText={front => update({ front })} testID="course-flashcard-front" />
    <Field label="Jawaban" value={draft.back} multiline maxLength={10_000} disabled={!mutation.editable}
      onChangeText={back => update({ back })} testID="course-flashcard-back" />
    <Field label="Penjelasan (opsional)" value={draft.explanation ?? ""} multiline maxLength={20_000} disabled={!mutation.editable}
      onChangeText={explanation => update({ explanation })} />
    <WriteFeedback mutation={mutation} reload={reload} invalid="Periksa isi kartu atau set yang dipilih." />
    <FormActions busy={mutation.busy} enabled={mutation.editable && Boolean(draft.front.trim() && draft.back.trim())} close={close}
      submit={() => mutation.submit({ ...draft, front: draft.front.trim(), back: draft.back.trim(), explanation: draft.explanation?.trim() || null })} />
  </CourseDialog>;
}

function WriteFeedback({ mutation, reload, invalid }: {
  mutation: Pick<ReturnType<typeof useCourseWrite>, "status" | "retry" | "stale" | "confirmed">; reload(): void; invalid: string;
}) {
  const { status, retry, stale, confirmed } = mutation;
  const messages = {
    invalid, denied: "Akses ditolak.", missing: "Set atau kartu tidak ditemukan.",
    conflict: "Isi sudah berubah. Muat versi terbaru sebelum menyimpan.",
    retry: "Status penyimpanan belum diketahui. Periksa hasil sebelum mengirim lagi.",
  };
  return <>
    {status && status in messages ? <CourseStatus label={confirmed ? "Perubahan sudah tersimpan." : messages[status as keyof typeof messages]}
      retry={status === "retry" ? retry : undefined} error={!confirmed} /> : null}
    {stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
    {status === "sending" ? <CourseStatus label="Menyimpan…" /> : null}
  </>;
}

function FormActions({ busy, enabled, close, submit }: { busy: boolean; enabled: boolean; close(): void; submit(): void }) {
  return <View style={layout.row}>
    <Action label="Simpan" variation="default" disabled={!enabled} onPress={submit} testID="course-flashcard-save" />
    <Action label="Batal" variation="ghost" disabled={busy} onPress={close} />
  </View>;
}
