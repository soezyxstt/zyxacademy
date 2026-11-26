import { useState } from "react";
import { View } from "react-native";
import { allowedCategories } from "../../../../../packages/academic/course-categories";
import type { AdminCourseEditDraft, AdminCourseEditor, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, Picker, layout } from "./ui";

type Settings = AdminCourseSectionResult & { type: "settings" };
const categories = allowedCategories.map((id) => ({ id, label: id }));

export function LiveCourseEdit({ data, save, refresh }: { data: Settings; save: AdminCourseEditor; refresh(): void }) {
  const [open, setOpen] = useState(false);
  const target = save(data.course.id);
  return (
    <>
      <Action label={target.pending() ? "Periksa penyimpanan" : "Edit informasi"} onPress={() => setOpen(true)} testID="course-settings-edit" />
      {open ? <EditForm data={data} target={target} close={() => setOpen(false)} refresh={refresh} /> : null}
    </>
  );
}

function EditForm({ data, target, close, refresh }: { data: Settings; target: CourseWriteTarget<AdminCourseEditDraft>; close(): void; refresh(): void }) {
  const existing = target.pending();
  const [revision] = useState(existing?.draft.expectedRevision ?? data.revision);
  const [title, setTitle] = useState(existing?.draft.title ?? data.course.title);
  const [category, setCategory] = useState(existing?.draft.category ?? data.course.category);
  const [description, setDescription] = useState(existing ? existing.draft.description ?? "" : data.description ?? "");
  function reload() {
    close();
    refresh();
  }

  const mutation = useCourseWrite(target, reload);
  const { status, setStatus, editable: canEdit } = mutation;

  function submit() {
    if (!title.trim()) {
      setStatus("invalid");
      return;
    }
    mutation.submit({ title: title.trim(), category, description: description.trim() || null, expectedRevision: revision });
  }

  const errors = {
    invalid: "Periksa nama, kategori, dan deskripsi mata kuliah.",
    denied: "Akses ditolak.",
    missing: "Mata kuliah tidak ditemukan.",
    conflict: "Data sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
    retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
  };

  return (
    <CourseDialog title="Edit informasi mata kuliah" onClose={close} dismissDisabled={status === "sending"}>
      <Field label="Nama mata kuliah" value={title} maxLength={500} disabled={!canEdit}
        onChangeText={(value) => { setTitle(value); setStatus(null); }} testID="course-settings-title" />
      {!data.canonicalOnly ? (
        <>
          {canEdit ? (
            <Picker label="Kategori" selected={category} onSelect={(value) => { setCategory(value); setStatus(null); }}
              options={categories} testID="course-settings-category" />
          ) : null}
          <Field label="Deskripsi" value={description} maxLength={20_000} disabled={!canEdit} multiline
            onChangeText={(value) => { setDescription(value); setStatus(null); }} />
        </>
      ) : null}
      {status === "retry" && mutation.confirmed ? (
        <View style={layout.group}>
          <CourseStatus label="Informasi mata kuliah sudah tersimpan." />
          <Action label="Muat rincian terbaru" onPress={mutation.retry} />
        </View>
      ) : status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error
        retry={status === "retry" ? mutation.retry : undefined} /> : null}
      {mutation.stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
      {status === "sending" ? <CourseStatus label="Menyimpan perubahan…" /> : null}
      <View style={layout.row}>
        <Action label="Simpan" variation="default" onPress={submit} disabled={!canEdit} testID="course-settings-save" />
        <Action label="Batal" variation="ghost" onPress={close} disabled={status === "sending"} />
      </View>
    </CourseDialog>
  );
}
