import { useState } from "react";
import { View } from "react-native";
import type { AdminChapter, AdminCourseOverview } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminChapterDraft, AdminChapterEditor } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, layout } from "./ui";

const errors = {
  invalid: "Periksa judul dan deskripsi bab.",
  denied: "Akses ditolak.",
  missing: "Bab atau mata kuliah tidak ditemukan.",
  conflict: "Bab sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
  retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
};

export function LiveChapterEditor({ chapter, course, edit, save, close, refresh }: {
  chapter?: AdminChapter;
  course: AdminCourseOverview["course"];
  edit: NonNullable<AdminCourseOverview["chapterEdit"]>;
  save: AdminChapterEditor;
  close(): void;
  refresh(): void;
}) {
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [description, setDescription] = useState(chapter?.description ?? "");
  const [revision] = useState(edit.revision);
  const [invalidTitle, setInvalidTitle] = useState(false);
  function reload() {
    close();
    refresh();
  }

  const mutation = useCourseWrite((draft: AdminChapterDraft, requestId, signal) =>
    save(course.slug, chapter?.id, draft, requestId, signal), reload);
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
      {status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error
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
