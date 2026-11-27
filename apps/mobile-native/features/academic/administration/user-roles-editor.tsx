import { useState } from "react";
import { View } from "react-native";
import { adminUserRoles, type AdminUserRole, type AdminUserRolesEdit, type AdminUserRolesRevision } from "../../../../../packages/academic/admin-user-roles";
import type { AcademicTransport } from "../client";
import { useCourseWrite } from "../courses/live-write";
import { createCourseCommandTarget } from "../courses/write-client";
import { Action, CourseDialog, Ink, layout, MultiChoice } from "./ui";

const labels = { admin: "Admin", tutor: "Tutor", murid: "Peserta" };
const options = adminUserRoles.map((id) => ({ id, label: labels[id] }));
const commands = new WeakMap<AcademicTransport, ReturnType<typeof createCourseCommandTarget<AdminUserRolesEdit>>>();

export function UserRolesEditor({ id, name, email, initial, transport, send, close, refresh, denied, saved }: {
  id: string; name: string; email?: string; initial: AdminUserRolesRevision; transport: AcademicTransport;
  send: NonNullable<AcademicTransport["command"]>; close(): void; refresh(): void; denied(): void; saved(): void;
}) {
  let factory = commands.get(transport);
  if (!factory) {
    factory = createCourseCommandTarget<AdminUserRolesEdit>(send.bind(transport), undefined, "/api/native/academic-administration/users");
    commands.set(transport, factory);
  }
  const target = factory(`${encodeURIComponent(id)}/roles`, "PATCH");
  const prior = target.pending()?.draft;
  const [roles, setRoles] = useState<AdminUserRole[]>(prior?.roles ?? initial.roles);
  const [confirm, setConfirm] = useState(Boolean(prior));
  const write = useCourseWrite(target, saved);
  const selfDemotion = id === transport.accountId && !roles.includes("admin");
  const changed = options.some(({ id: role }) => initial.roles.includes(role) !== roles.includes(role));
  const valid = roles.length > 0 && !selfDemotion && changed;
  return <CourseDialog title={confirm ? "Konfirmasi perubahan peran" : "Kelola peran"} onClose={close} dismissDisabled={write.busy}>
    <Ink kind="strong">{name}</Ink>
    {email ? <Ink>{email}</Ink> : null}
    {confirm ? <Ink>{`Peran sesudah disimpan: ${roles.map((role) => labels[role]).join(", ")}`}</Ink>
      : <MultiChoice label="Peran" options={options} chosen={roles} change={setRoles} disabled={!write.editable} />}
    {selfDemotion ? <Ink tone="error">Pertahankan peran Admin pada akun Anda.</Ink> : null}
    {write.status === "retry" ? <Ink>Hasil perubahan belum diketahui.</Ink> : null}
    {write.stale ? <Ink>Data akun telah berubah. Muat ulang sebelum mengubah peran.</Ink> : null}
    {write.status === "invalid" ? <Ink tone="error">Perubahan peran tidak dapat disimpan.</Ink> : null}
    {write.status === "denied" ? <Ink tone="error">Akses Admin diperlukan.</Ink> : null}
    <View style={layout.row}>
      <Action label="Tutup" onPress={close} disabled={write.busy} />
      {write.stale ? <Action label="Muat ulang" onPress={refresh} />
        : write.status === "denied" ? <Action label="Periksa akses" onPress={denied} />
        : write.status === "retry" ? <Action label="Coba lagi" onPress={write.retry} />
        : <Action label={confirm ? "Simpan peran" : "Lanjutkan"} disabled={!valid || !write.editable} variation="default"
          onPress={() => confirm ? write.submit({ accountId: transport.accountId, roles, expectedRevision: initial.revision, confirmed: true }) : setConfirm(true)} />}
    </View>
  </CourseDialog>;
}
