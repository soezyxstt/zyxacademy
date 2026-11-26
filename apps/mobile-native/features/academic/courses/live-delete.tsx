import { useState } from "react";
import { View } from "react-native";
import type { AdminEntityDeleteDraft, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { useCourseWrite } from "./live-write";
import { Action, CourseDialog, CourseStatus, Ink, layout } from "./ui";

type Props = {
  label: string;
  name: string;
  detail?: string;
  revision: string;
  refresh(): void;
  target: CourseWriteTarget<AdminEntityDeleteDraft>;
};

export function LiveCourseDelete(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <Action label={props.target.pending() ? "Periksa penghapusan" : props.label} onPress={() => setOpen(true)} />
    {open ? <DeleteDialog {...props} close={() => setOpen(false)} /> : null}
  </>;
}

const errors = {
  invalid: "Permintaan penghapusan tidak valid.",
  denied: "Akses ditolak.",
  missing: "Item sudah tidak tersedia.",
  conflict: "Isi sudah berubah. Muat ulang sebelum menghapus.",
  dependencies: "Ada isi terkait yang perlu diperiksa dahulu.",
  retry: "Status penghapusan belum diketahui. Periksa hasil sebelum melanjutkan.",
};

function DeleteDialog({ label, name, detail, revision, refresh, target, close }: Props & { close(): void }) {
  const reload = () => { close(); refresh(); };
  const mutation = useCourseWrite(target, reload);
  const { status } = mutation;
  const error = status && status in errors ? errors[status as keyof typeof errors] : null;
  return <CourseDialog title={label} onClose={close} dismissDisabled={mutation.busy}>
    <Ink kind="heading">{name}</Ink>
    {detail ? <Ink>{detail}</Ink> : null}
    {error ? <CourseStatus error label={mutation.confirmed ? "Penghapusan sudah tersimpan." : error}
      retry={status === "retry" ? mutation.retry : undefined} /> : null}
    {mutation.stale || status === "dependencies" ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
    {mutation.busy ? <CourseStatus label="Menghapus…" /> : null}
    <View style={layout.row}>
      <Action label={label} variation="destructive" disabled={!mutation.editable}
        onPress={() => mutation.submit({ expectedRevision: revision, confirmed: true })} />
      <Action label="Batal" variation="ghost" disabled={mutation.busy} onPress={close} />
    </View>
  </CourseDialog>;
}
