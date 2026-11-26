import { useState } from "react";
import { View } from "react-native";
import type {
  AdminMaterialTitleDraft, AdminMaterialTitleEdit, CourseWriteTarget,
} from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, layout } from "./ui";

type Props = {
  initial: AdminMaterialTitleEdit;
  target: CourseWriteTarget<AdminMaterialTitleDraft>;
  refresh(): void;
};

export function LivePdfTitleEdit({ initial, target, refresh }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Action label={target.pending() ? "Periksa penyimpanan" : "Edit judul"} onPress={() => setOpen(true)} testID="course-material-edit-title" />
      {open ? <PdfTitleForm initial={initial} target={target} close={() => setOpen(false)} refresh={refresh} /> : null}
    </>
  );
}

const errors = {
  invalid: "Judul dokumen wajib diisi.",
  denied: "Akses ditolak.",
  missing: "Dokumen atau mata kuliah tidak ditemukan.",
  conflict: "Judul dokumen sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
  retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
};

function PdfTitleForm({ initial, target, close, refresh }: Props & { close(): void }) {
  const previous = target.pending();
  const [title, setTitle] = useState(previous?.draft.title ?? initial.title);
  const [revision] = useState(previous?.draft.expectedRevision ?? initial.revision);
  function reload() {
    close();
    refresh();
  }
  const mutation = useCourseWrite(target, reload);
  const { status } = mutation;

  function save() {
    const cleaned = title.trim();
    if (!cleaned) {
      mutation.setStatus("invalid");
      return;
    }
    mutation.submit({ title: cleaned, expectedRevision: revision });
  }

  return (
    <CourseDialog title="Edit judul dokumen" onClose={close} dismissDisabled={mutation.busy} testID="course-material-title-dialog">
      <Field label="Judul dokumen" value={title} maxLength={500} disabled={!mutation.editable} testID="course-material-title"
        onChangeText={(value) => { setTitle(value); mutation.setStatus(null); }} />
      {status === "retry" && mutation.confirmed ? (
        <View style={layout.group}>
          <CourseStatus label="Judul dokumen sudah tersimpan." />
          <Action label="Muat rincian terbaru" onPress={mutation.retry} />
        </View>
      ) : status && status in errors ? (
        <CourseStatus label={errors[status as keyof typeof errors]} retry={status === "retry" ? mutation.retry : undefined} error />
      ) : null}
      {mutation.stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
      {mutation.busy ? <CourseStatus label="Menyimpan judul…" /> : null}
      <View style={layout.row}>
        <Action label="Simpan judul" variation="default" onPress={save} disabled={!mutation.editable} testID="course-material-save-title" />
        <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.busy} />
      </View>
    </CourseDialog>
  );
}
