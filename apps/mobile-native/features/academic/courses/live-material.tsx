import { useState } from "react";
import { getSubcategoriesForLevel1, LEVEL1_CATEGORIES, type MaterialLevel1Category, type CourseMaterialSubcategory } from "../../../../../lib/course-materials";
import { View } from "react-native";
import {
  validAdminMaterialTitle, type AdminMaterialEditor, type AdminMaterialTitleDraft, type AdminMaterialTitleEdit, type CourseWriteTarget,
} from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { DocumentSuggestion } from "./document-suggestion";
import { LiveCourseDelete } from "./live-delete";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, Ink, Picker, layout } from "./ui";

type Props = {
  initial: AdminMaterialTitleEdit;
  slug: string; documentId: string;
  target: CourseWriteTarget<AdminMaterialTitleDraft>;
  refresh(): void;
};

export function LivePdfTitleEdit({ initial, target, slug, documentId, refresh, onDeleted }: Props & { target: ReturnType<AdminMaterialEditor>; onDeleted(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Action label={target.pending() ? "Periksa penyimpanan" : "Edit dokumen"} onPress={() => setOpen(true)} testID="course-material-edit-title" />
      {target.remove && <LiveCourseDelete label="Hapus dokumen" name={initial.title} detail="PDF ini akan dihapus dari materi mata kuliah."
        target={target.remove} revision={initial.revision} refresh={onDeleted} />}
      {open ? <PdfTitleForm slug={slug} documentId={documentId} initial={initial} target={target} close={() => setOpen(false)} refresh={refresh} /> : null}
    </>
  );
}

const errors = {
  invalid: "Periksa judul, tahun, kategori, dan pilihan bab.",
  denied: "Akses ditolak.",
  missing: "Dokumen atau mata kuliah tidak ditemukan.",
  conflict: "Dokumen sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
  retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
};

function PdfTitleForm({ initial, target, close, refresh, slug, documentId }: Props & { close(): void }) {
  const previous = target.pending();
  const [title, setTitle] = useState(previous?.draft.title ?? initial.title);
  const [metadata, setMetadata] = useState(previous?.draft.metadata ?? initial.metadata);
  const [editingMetadata, setEditingMetadata] = useState(Boolean(previous?.draft.metadata));
  const [year, setYear] = useState(metadata?.year?.toString() ?? "");
  const [revision] = useState(previous?.draft.expectedRevision ?? initial.revision);
  function reload() {
    close();
    refresh();
  }
  const mutation = useCourseWrite(target, reload);
  const { status } = mutation;

  function save() {
    const cleaned = title.trim();
    if (!validAdminMaterialTitle(cleaned)) {
      mutation.setStatus("invalid");
      return;
    }
    if (editingMetadata && metadata) {
      if (!metadata.chapterIds.length || (year && (!/^\d{4}$/.test(year) || +year < 1900 || +year > 2100))) {
        mutation.setStatus("invalid");
        return;
      }
      mutation.submit({ title: cleaned, expectedRevision: revision, metadata: { ...metadata, year: year ? Number(year) : null } });
    } else mutation.submit({ title: cleaned, expectedRevision: revision });
  }

  return (
    <CourseDialog title="Edit dokumen" onClose={close} dismissDisabled={mutation.busy} testID="course-material-title-dialog">
      <Field label="Judul dokumen" value={title} maxLength={500} disabled={!mutation.editable} testID="course-material-title"
        onChangeText={(value) => { setTitle(value); mutation.setStatus(null); }} />
      {metadata && initial.chapters && <>
        <DocumentSuggestion slug={slug} id={documentId} source="pdf"
          values={{ title, category: metadata.type, subcategory: metadata.subcategory, year: year ? Number(year) : null }}
          disabled={!mutation.editable} onSuggested={suggestion => {
            setTitle(suggestion.title);
            if (suggestion.year !== null) setYear(String(suggestion.year));
            setMetadata({ ...metadata, type: suggestion.category, subcategory: suggestion.subcategory,
              chapterIds: suggestion.chapterIds.length ? suggestion.chapterIds : metadata.chapterIds });
            setEditingMetadata(true);
          }} />
        <Picker label="Kategori" selected={metadata.type} options={LEVEL1_CATEGORIES.map(({ value, label }) => ({ id: value, label }))}
          disabled={!mutation.editable} onSelect={type => { setMetadata({ ...metadata, type: type as MaterialLevel1Category, subcategory: null }); setEditingMetadata(true); }} />
        <Picker label="Subkategori" selected={metadata.subcategory ?? ""} disabled={!mutation.editable}
          options={[{ id: "", label: "Tanpa subkategori" }, ...getSubcategoriesForLevel1(metadata.type).map(({ value, label }) => ({ id: value, label }))]}
          onSelect={value => { setMetadata({ ...metadata, subcategory: value ? value as CourseMaterialSubcategory : null }); setEditingMetadata(true); }} />
        <Field label="Tahun" value={year} keyboardType="number-pad" maxLength={4} disabled={!mutation.editable}
          onChangeText={value => { setYear(value); setEditingMetadata(true); }} />
        <Ink kind="heading">Bab terkait</Ink>
        {[...initial.chapters, ...metadata.chapterIds.filter(id => !initial.chapters!.some(chapter => chapter.id === id)).map(id => ({ id, title: id }))].map(chapter => {
          const selected = metadata.chapterIds.includes(chapter.id);
          return <Action key={chapter.id} label={chapter.title} selected={selected} disabled={!mutation.editable} onPress={() => {
            setMetadata({ ...metadata, chapterIds: selected ? metadata.chapterIds.filter(id => id !== chapter.id) : [...metadata.chapterIds, chapter.id] });
            setEditingMetadata(true);
          }} />;
        })}
      </>}
      {status === "retry" && mutation.confirmed ? (
        <View style={layout.group}>
          <CourseStatus label="Dokumen sudah tersimpan." />
          <Action label="Muat rincian terbaru" onPress={mutation.retry} />
        </View>
      ) : status && status in errors ? (
        <CourseStatus label={errors[status as keyof typeof errors]} retry={status === "retry" ? mutation.retry : undefined} error />
      ) : null}
      {mutation.stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
      {mutation.busy ? <CourseStatus label="Menyimpan dokumen…" /> : null}
      <View style={layout.row}>
        <Action label="Simpan" variation="default" onPress={save} disabled={!mutation.editable} testID="course-material-save-title" />
        <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.busy} />
      </View>
    </CourseDialog>
  );
}
