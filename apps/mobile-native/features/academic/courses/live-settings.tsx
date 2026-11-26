import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { allowedCategories } from "../../../../../packages/academic/course-categories";
import type { AdminCourseEditDraft, AdminCourseEditResponse, AdminCourseEditor } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { Action, CourseDialog, CourseStatus, Field, Picker, layout } from "./ui";

type Settings = AdminCourseSectionResult & { type: "settings" };
const categories = allowedCategories.map((id) => ({ id, label: id }));

type Pending = { requestId: string; draft: AdminCourseEditDraft };

export function LiveCourseEdit({ data, save, refresh }: { data: Settings; save: AdminCourseEditor; refresh(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Action label="Edit informasi" onPress={() => setOpen(true)} testID="course-settings-edit" />
      {open ? <EditForm data={data} save={save} close={() => setOpen(false)} refresh={refresh} /> : null}
    </>
  );
}

function EditForm({ data, save, close, refresh }: { data: Settings; save: AdminCourseEditor; close(): void; refresh(): void }) {
  const [revision] = useState(data.revision);
  const [title, setTitle] = useState(data.course.title);
  const [category, setCategory] = useState(data.course.category);
  const [description, setDescription] = useState(data.description ?? "");
  const [status, setStatus] = useState<AdminCourseEditResponse["status"] | "sending" | null>(null);
  const pending = useRef<Pending | null>(null);
  const sending = useRef<AbortController | null>(null);
  useEffect(() => () => sending.current?.abort(), []);

  async function submit(request?: Pending) {
    if (sending.current) return;
    if (!request && !title.trim()) {
      setStatus("invalid");
      return;
    }
    const command = request ?? {
      requestId: randomUUID(),
      draft: { title: title.trim(), category, description: description.trim() || null, expectedRevision: revision },
    };
    pending.current = command;
    const controller = new AbortController();
    sending.current = controller;
    setStatus("sending");
    try {
      const result = await save(data.course.slug, command.draft, command.requestId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "saved") {
        close();
        refresh();
      } else {
        setStatus(result.status);
      }
    } catch {
      if (!controller.signal.aborted) setStatus("retry");
    } finally {
      sending.current = null;
    }
  }

  const unresolved = status === "sending" || status === "retry";
  const stale = status === "conflict" || status === "missing";
  const denied = status === "denied";
  const canEdit = !unresolved && !stale && !denied;
  const errors = {
    invalid: "Periksa nama, kategori, dan deskripsi mata kuliah.",
    denied: "Akses ditolak.",
    missing: "Mata kuliah tidak ditemukan.",
    conflict: "Data sudah berubah. Muat versi terbaru sebelum mengedit lagi.",
    retry: "Status penyimpanan belum diketahui. Coba lagi untuk memeriksa hasil.",
  };

  function reload() {
    close();
    refresh();
  }

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
      {status && status in errors ? <CourseStatus label={errors[status as keyof typeof errors]} error
        retry={status === "retry" ? () => { if (pending.current) void submit(pending.current); } : undefined} /> : null}
      {stale ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
      {status === "sending" ? <CourseStatus label="Menyimpan perubahan…" /> : null}
      <View style={layout.row}>
        <Action label="Simpan" variation="default" onPress={() => void submit()} disabled={!canEdit} testID="course-settings-save" />
        <Action label="Batal" variation="ghost" onPress={close} disabled={status === "sending"} />
      </View>
    </CourseDialog>
  );
}
