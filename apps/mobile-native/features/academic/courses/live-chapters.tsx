import { useState } from "react";
import { View } from "react-native";
import type { AdminChapter, AdminCourseOverview } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminChapterArchiveDraft, AdminChapterDraft, AdminChapterOrderDraft, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, Ink, layout } from "./ui";

const errors = {
  invalid: "Periksa judul dan deskripsi bab.",
  denied: "Akses ditolak.",
  missing: "Bab atau mata kuliah tidak ditemukan.",
  conflict: "Bab sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
  retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
};

export function LiveChapterEditor({ chapter, edit, target, close, refresh }: {
  chapter?: AdminChapter;
  edit: NonNullable<AdminCourseOverview["chapterEdit"]>;
  target: CourseWriteTarget<AdminChapterDraft>;
  close(): void;
  refresh(): void;
}) {
  const existing = target.pending();
  const [title, setTitle] = useState(existing?.draft.title ?? chapter?.title ?? "");
  const [description, setDescription] = useState(existing ? existing.draft.description ?? "" : chapter?.description ?? "");
  const [revision] = useState(existing?.draft.expectedRevision ?? edit.revision);
  const [invalidTitle, setInvalidTitle] = useState(false);
  function reload() {
    close();
    refresh();
  }

  const mutation = useCourseWrite(target, reload);
  const { status } = mutation;

  function submit() {
    if (!title.trim()) {
      setInvalidTitle(true);
      return;
    }
    mutation.submit({ title: title.trim(), description: edit.allowsDescription ? description.trim() || null : null, expectedRevision: revision });
  }

  return (
    <CourseDialog title={chapter ? "Edit bab" : "Tambah bab"} onClose={close} dismissDisabled={mutation.busy} testID="course-chapter-dialog">
      <Field label="Judul bab" value={title} maxLength={500} disabled={!mutation.editable} testID="course-chapter-title"
        onChangeText={(value) => { setTitle(value); setInvalidTitle(false); mutation.setStatus(null); }} />
      {edit.allowsDescription ? (
        <Field label="Deskripsi bab" value={description} maxLength={20_000} disabled={!mutation.editable} multiline
          testID="course-chapter-description"
          onChangeText={(value) => { setDescription(value); mutation.setStatus(null); }} />
      ) : null}
      {invalidTitle ? <CourseStatus label="Judul bab wajib diisi." error /> : null}
      {status === "retry" && mutation.confirmed ? (
        <View style={layout.group}>
          <CourseStatus label="Bab sudah tersimpan." />
          <Action label="Muat rincian terbaru" onPress={mutation.retry} />
        </View>
      ) : status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error
        retry={status === "retry" ? mutation.retry : undefined} /> : null}
      {mutation.stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
      {mutation.busy ? <CourseStatus label="Menyimpan bab…" /> : null}
      <View style={layout.row}>
        <Action label="Simpan bab" onPress={submit} variation="default" testID="course-chapter-save" disabled={!mutation.editable} />
        <Action label="Batal" onPress={close} variation="ghost" testID="course-chapter-cancel" disabled={mutation.busy} />
      </View>
    </CourseDialog>
  );
}

const structureErrors = {
  invalid: "Periksa data bab.", denied: "Akses ditolak.", missing: "Bab atau mata kuliah tidak ditemukan.",
  conflict: "Daftar bab sudah berubah. Muat versi terbaru.",
  dependencies: "Bab masih digunakan oleh materi atau aktivitas. Selesaikan referensinya sebelum menghapus.",
  retry: "Status perubahan belum diketahui. Coba lagi untuk memeriksa hasil.",
};

function ChapterMutationFeedback({ mutation, reload }: {
  mutation: Pick<ReturnType<typeof useCourseWrite>, "status" | "busy" | "stale" | "retry">; reload(): void;
}) {
  const { status } = mutation;
  return <>
    {mutation.busy ? <CourseStatus label="Menyimpan perubahan…" /> : null}
    {status && status in structureErrors ? <CourseStatus label={structureErrors[status as keyof typeof structureErrors]}
      error retry={status === "retry" ? mutation.retry : undefined} /> : null}
    {mutation.stale || status === "dependencies" ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
  </>;
}

export function LiveChapterArchive({ chapter, revision, target, close, refresh }: {
  chapter: AdminChapter; revision: string; target: CourseWriteTarget<AdminChapterArchiveDraft>; close(): void; refresh(): void;
}) {
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  return <CourseDialog title="Hapus bab?" onClose={close} dismissDisabled={mutation.busy} testID="course-chapter-archive-dialog">
    <Ink>{chapter.title}</Ink>
    <Ink kind="meta" tone="muted">Bab akan hilang dari mata kuliah.</Ink>
    <ChapterMutationFeedback mutation={mutation} reload={reload} />
    <View style={layout.row}>
      <Action label="Hapus bab" variation="destructive" disabled={!mutation.editable || mutation.status === "dependencies"}
        onPress={() => mutation.submit({ expectedRevision: revision, confirmed: true })} testID="course-chapter-archive-confirm" />
      <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.busy} />
    </View>
  </CourseDialog>;
}

export function LiveChapterOrder({ chapters, revision, target, close, refresh }: {
  chapters: readonly AdminChapter[]; revision: string; target: CourseWriteTarget<AdminChapterOrderDraft>; close(): void; refresh(): void;
}) {
  const existing = target.pending()?.draft.chapterIds;
  const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
  const initial = chapters.map(chapter => chapter.id);
  const [order, setOrder] = useState(existing ?? initial);
  const pageSize = 12;
  const [page, setPage] = useState(0);
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  function move(index: number, offset: number) {
    if (!mutation.editable || index + offset < 0 || index + offset >= order.length) return;
    const next = [...order];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setOrder(next);
    setPage(Math.floor((index + offset) / pageSize));
  }
  const changed = order.some((id, index) => id !== initial[index]);
  return <CourseDialog title="Susun bab" onClose={close} dismissDisabled={mutation.busy} testID="course-chapter-order-dialog">
    {order.slice(page * pageSize, (page + 1) * pageSize).map((id, offset) => {
      const index = page * pageSize + offset;
      return <View key={id} style={layout.group}>
        <Ink kind="strong">{`${index + 1}. ${byId.get(id)?.title ?? id}`}</Ink>
        <View style={layout.row}>
          <Action label="Naikkan" testID={`course-chapter-up-${id}`} onPress={() => move(index, -1)} disabled={!mutation.editable || index === 0} />
          <Action label="Turunkan" testID={`course-chapter-down-${id}`} onPress={() => move(index, 1)} disabled={!mutation.editable || index === order.length - 1} />
        </View>
      </View>;
    })}
    {order.length > pageSize ? <View style={layout.row}>
      <Action label="Sebelumnya" onPress={() => setPage(page - 1)} disabled={page === 0} />
      <Ink kind="meta">{`${page + 1} / ${Math.ceil(order.length / pageSize)}`}</Ink>
      <Action label="Berikutnya" onPress={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= order.length} />
    </View> : null}
    <ChapterMutationFeedback mutation={mutation} reload={reload} />
    <View style={layout.row}>
      <Action label="Simpan urutan" variation="default" disabled={!mutation.editable || !changed}
        onPress={() => mutation.submit({ expectedRevision: revision, chapterIds: order })} testID="course-chapter-order-save" />
      <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.busy} />
    </View>
  </CourseDialog>;
}
