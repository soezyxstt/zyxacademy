import { useState } from "react";
import { View } from "react-native";
import { allowedCategories } from "../../../../../packages/academic/course-categories";
import { parseCoursePricingInput, type CoursePricingCategory } from "../../../../../packages/academic/course-pricing";
import type { AdminCourseArchiveDraft, AdminCourseCreateDraft, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { displayWib, formatWib } from "./course-pricing-fields";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Field, Ink, Picker, layout } from "./ui";

const categories = allowedCategories.map(id => ({ id, label: id }));
const pricingOptions = [
  { id: "premium", label: "Premium" }, { id: "free", label: "Gratis" }, { id: "limited_time_free", label: "Gratis sementara" },
] as const;

export function LiveCourseCreateForm({ target, close, saved, reload }: {
  target: CourseWriteTarget<AdminCourseCreateDraft>; close(): void; saved(): void; reload(): void;
}) {
  const existing = target.pending()?.draft;
  const [id, setId] = useState(existing?.id ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [access, setAccess] = useState<CoursePricingCategory>(existing?.pricing.category ?? "premium");
  const [start, setStart] = useState(displayWib(existing?.pricing.startsAt ? new Date(existing.pricing.startsAt) : null));
  const [end, setEnd] = useState(displayWib(existing?.pricing.endsAt ? new Date(existing.pricing.endsAt) : null));
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useCourseWrite(target, saved);
  const { busy, editable, status } = mutation;

  function submit() {
    const code = id.trim().toLowerCase();
    const name = title.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(code)) return setValidation("ID harus diawali huruf kecil atau angka. Gunakan huruf kecil, angka, dan tanda hubung.");
    if (!name) return setValidation("Nama mata kuliah wajib diisi.");
    if (!categories.some(option => option.id === category)) return setValidation("Pilih kategori mata kuliah.");
    try {
      const pricing = parseCoursePricingInput({ category: access, startsAt: formatWib(start), endsAt: formatWib(end) });
      if (access === "limited_time_free" && (displayWib(pricing.startsAt) !== start || displayWib(pricing.endsAt) !== end)) {
        throw new Error("Invalid WIB date");
      }
      setValidation(null);
      mutation.submit({ id: code, title: name, category, description: description.trim() || null,
        pricing: { category: pricing.category, startsAt: pricing.startsAt?.toISOString() ?? null, endsAt: pricing.endsAt?.toISOString() ?? null } });
    } catch {
      setValidation("Masukkan tanggal dan waktu WIB yang valid. Waktu akhir harus setelah waktu mulai.");
    }
  }

  const change = (set: (value: string) => void) => (value: string) => { set(value); setValidation(null); mutation.setStatus(null); };
  const errors = {
    invalid: "Periksa informasi mata kuliah.", exists: "ID mata kuliah sudah terdaftar.", denied: "Akses ditolak.",
    missing: "Mata kuliah tidak ditemukan.", conflict: "Data sudah berubah. Muat daftar terbaru.",
    retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
  };
  return <CourseDialog title="Tambah mata kuliah" onClose={close} dismissDisabled={busy}>
    <Field label="ID mata kuliah" value={id} onChangeText={change(setId)} disabled={!editable} maxLength={100}
      autoCorrect={false} autoCapitalize="none" testID="course-field-id" />
    <Field label="Nama mata kuliah" value={title} onChangeText={change(setTitle)} disabled={!editable} maxLength={500} testID="course-field-title" />
    <Picker label="Kategori" selected={category} disabled={!editable} onSelect={change(setCategory)} options={categories} testID="course-field-category" />
    <Field label="Deskripsi" value={description} multiline onChangeText={change(setDescription)} disabled={!editable} maxLength={20_000} />
    <Picker label="Akses mata kuliah" selected={access} disabled={!editable} onSelect={(value) => {
      const option = pricingOptions.find(option => option.id === value);
      if (option) change(() => setAccess(option.id))(value);
    }}
      options={pricingOptions} testID="course-field-access" />
    {access === "limited_time_free" && <>
      <Ink kind="meta" tone="muted">Gunakan format YYYY-MM-DD JJ:MM dalam WIB.</Ink>
      <Field label="Mulai gratis" value={start} onChangeText={change(setStart)} disabled={!editable} />
      <Field label="Akhir gratis" value={end} onChangeText={change(setEnd)} disabled={!editable} />
    </>}
    {validation ? <CourseStatus label={validation} error /> : null}
    {status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error retry={status === "retry" ? mutation.retry : undefined} /> : null}
    {mutation.stale ? <Action label="Muat daftar terbaru" onPress={reload} /> : null}
    {busy ? <CourseStatus label="Menyimpan mata kuliah…" /> : null}
    <View style={layout.row}>
      <Action label="Simpan" variation="default" onPress={submit} disabled={!editable} testID="course-save" />
      <Action label="Batal" variation="ghost" onPress={close} disabled={busy} />
    </View>
  </CourseDialog>;
}

export function LiveCourseArchive({ target, title, revision, saved, refresh }: {
  target: CourseWriteTarget<AdminCourseArchiveDraft>; title: string; revision: string; saved(): void; refresh(): void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Action label={target.pending() ? "Periksa pengarsipan" : "Arsipkan mata kuliah"} variation="destructive"
      onPress={() => setOpen(true)} testID="course-archive" />
    {open ? <ArchiveDialog {...{ target, title, revision, saved, refresh }} close={() => setOpen(false)} /> : null}
  </>;
}

function ArchiveDialog({ target, title, revision, close, saved, refresh }: {
  target: CourseWriteTarget<AdminCourseArchiveDraft>; title: string; revision: string; close(): void; saved(): void; refresh(): void;
}) {
  const mutation = useCourseWrite(target, saved);
  const { busy, status } = mutation;
  const errors = {
    invalid: "Konfirmasi pengarsipan tidak valid.", denied: "Akses ditolak.", missing: "Mata kuliah tidak ditemukan.",
    conflict: "Mata kuliah sudah berubah. Muat versi terbaru.",
    dependencies: "Mata kuliah masih memiliki data terkait. Selesaikan referensinya sebelum mengarsipkan.",
    retry: "Status pengarsipan belum diketahui. Coba lagi untuk memeriksa hasil.",
  };
  return <CourseDialog title="Arsipkan mata kuliah?" onClose={close} dismissDisabled={busy}>
    <Ink>{title}</Ink>
    <Ink kind="meta" tone="muted">Mata kuliah akan hilang dari daftar aktif dan akses offline terkait akan dicabut.</Ink>
    {status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error retry={status === "retry" ? mutation.retry : undefined} /> : null}
    {mutation.stale || status === "dependencies" ? <Action label="Muat versi terbaru" onPress={() => { close(); refresh(); }} /> : null}
    {busy ? <CourseStatus label="Mengarsipkan mata kuliah…" /> : null}
    <View style={layout.row}>
      <Action label="Arsipkan" variation="destructive" onPress={() => mutation.submit({ expectedRevision: revision, confirmed: true })}
        disabled={!mutation.editable || status === "dependencies"} testID="course-archive-confirm" />
      <Action label="Batal" variation="ghost" onPress={close} disabled={busy} />
    </View>
  </CourseDialog>;
}
