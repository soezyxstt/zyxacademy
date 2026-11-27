import { useState } from "react";
import type { AdminDemoSelection, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Ink } from "./ui";

type Props = {
  course: { id: string; title: string }; active: boolean; revision: string;
  selection: { current: { id: string; title: string } | null; eligible: boolean };
  target: CourseWriteTarget<AdminDemoSelection>; refresh(): void;
};

export function LiveDemoSelection(props: Props) {
  const [open, setOpen] = useState(false);
  const pending = props.target.pending();
  const enabled = pending?.draft.enabled ?? !props.active;
  const label = enabled ? "Jadikan demo publik" : "Lepas dari demo publik";
  return <>
    <Action label={pending ? "Periksa perubahan demo" : label} disabled={!pending && enabled && !props.selection.eligible}
      onPress={() => setOpen(true)} testID="course-demo-selection" />
    {open && <ChooseDemo {...props} enabled={enabled} label={label} close={() => setOpen(false)} />}
  </>;
}

function ChooseDemo({ course, revision, selection, target, refresh, enabled, label, close }: Props & {
  enabled: boolean; label: string; close(): void;
}) {
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  const messages = {
    denied: "Akses ditolak.", invalid: "Periksa kembali kesiapan demo mata kuliah ini.",
    missing: "Mata kuliah tidak ditemukan.", conflict: "Pilihan demo sudah berubah.",
    retry: "Hasil perubahan belum diketahui. Periksa kembali.",
  };
  return <CourseDialog title={label} onClose={close} dismissDisabled={mutation.busy}>
    <Ink kind="strong">{course.title}</Ink>
    {enabled && selection.current && selection.current.id !== course.id ? <Ink>Menggantikan {selection.current.title} sebagai demo publik.</Ink> : null}
    {mutation.status && mutation.status in messages ? <CourseStatus error label={messages[mutation.status as keyof typeof messages]}
      retry={mutation.status === "retry" ? mutation.retry : undefined} /> : null}
    {mutation.stale || mutation.status === "invalid" ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
    <Action label={label} variation="default" disabled={!mutation.editable}
      onPress={() => mutation.submit({ enabled, expectedRevision: revision, previousCourseId: selection.current?.id ?? null })} />
    <Action label="Batal" variation="ghost" disabled={mutation.busy} onPress={close} />
  </CourseDialog>;
}
