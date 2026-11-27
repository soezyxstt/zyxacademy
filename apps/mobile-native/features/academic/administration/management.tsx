import { useState } from "react";
import { View } from "react-native";
import { packagePresets, type Group, type GroupFields, type GroupStatus, type PackageType, type TokenFields, type User, type UserRole } from "../../../../../packages/native-parity/academic/administration/fixtures";
import { useAdministrationSnapshot, useAdministrationStore } from "./provider";
import {
  Action, CourseDialog, DataRow, Field, Ink, Metrics, MultiChoice, PagedRows, Picker, SaveButtons, SearchBox,
  Subheading, courseNames, courseOptions, dateLabel, idAndRevision, layout, matchWords, normalSearch, numberValue, useAdministrationMutation,
} from "./ui";

const roles: readonly { id: UserRole; label: string }[] = [
  { id: "admin", label: "Admin" }, { id: "tutor", label: "Tutor" }, { id: "student", label: "Peserta" },
];
const statusOptions = [{ id: "active", label: "Aktif" }, { id: "suspended", label: "Ditangguhkan" }] as const;
const groupStatusOptions = [
  { id: "active", label: "Aktif" }, { id: "completed", label: "Selesai" }, { id: "inactive", label: "Nonaktif" }, { id: "archived", label: "Diarsipkan" },
] as const;
const packages = (Object.keys(packagePresets) as PackageType[]).map((id) => ({ id, label: packagePresets[id].title }));
const allOptions = <T extends string>(label: string, options: readonly { id: T; label: string }[]) => [{ id: "", label }, ...options];
const roleNames = (user: User) => user.roles.map((id) => roles.find((role) => role.id === id)?.label).join(", ");

export function AdministrationUsers({ actorId }: { actorId: string }) {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [chosen, setChosen] = useState("");
  const [editing, setEditing] = useState<User>();
  const [draft, setDraft] = useState<UserRole[]>([]);
  const user = records.users.find((entry) => entry.id === chosen);
  const visible = records.users.filter((entry) => matchWords(normalSearch(query), [entry.name, entry.email])
    && (!role || entry.roles.includes(role as UserRole)) && (!status || entry.status === status));
  const current = user?.id === actorId;
  return <>
    <Metrics values={[
      { label: "Total", value: records.users.length },
      ...roles.map((item) => ({ label: item.label, value: records.users.filter((entry) => entry.roles.includes(item.id)).length })),
      { label: "Ditangguhkan", value: records.users.filter((entry) => entry.status === "suspended").length },
    ]} />
    <SearchBox label="Cari nama atau email" value={query} onChange={setQuery} testID="academic-users-search" />
    <View style={layout.row}>
      <Picker label="Peran" options={allOptions("Semua peran", roles)} selected={role} onSelect={setRole} />
      <Picker label="Status" options={allOptions("Semua status", statusOptions)} selected={status} onSelect={setStatus} />
    </View>
    {mutation.feedback}
    {user && !editing ? <CourseDialog title={user.name} onClose={() => setChosen("")}>
      <Ink>{user.email}</Ink>
      <Ink kind="meta" tone="muted">{[roleNames(user), current ? "Akun Anda" : "", user.status === "suspended" ? "Ditangguhkan" : "Aktif"].filter(Boolean).join(" · ")}</Ink>
      <View style={layout.row}>
        <Action label="Kelola peran" onPress={() => { setEditing(user); setDraft(user.roles); }} testID="academic-users-edit-role" />
        {!current ? <Action label={user.status === "suspended" ? "Aktifkan akun" : "Tangguhkan akun"} onPress={() => {
          const next = user.status === "suspended" ? "active" : "suspended";
          setChosen("");
          mutation.run({ type: "user.status", id: user.id, revision: user.revision, status: next }, {
            title: next === "active" ? "Aktifkan akun?" : "Tangguhkan akun?",
            description: `${user.name} · ${user.email}`, destructive: next === "suspended",
            confirmLabel: next === "active" ? "Aktifkan" : "Tangguhkan",
            success: next === "active" ? "Akun diaktifkan." : "Akun ditangguhkan.",
          });
        }} /> : null}
      </View>
    </CourseDialog> : null}
    {editing ? <Subheading title={`Peran ${editing.name}`}>
      <MultiChoice label="Peran" options={roles} chosen={draft} change={setDraft} />
      {current ? <Ink kind="meta" tone="muted">Pertahankan peran admin pada akun Anda.</Ink> : null}
      <SaveButtons onCancel={() => { setEditing(undefined); setChosen(""); }} onSave={() => mutation.run(
        { type: "user.roles", id: editing.id, revision: editing.revision, roles: draft },
        { success: "Peran diperbarui.", after: () => { setEditing(undefined); setChosen(""); },
          review: () => <Ink>{`Peran saat ini: ${user ? roleNames(user) : "Data tidak tersedia"}`}</Ink> },
      )} />
    </Subheading> : null}
    <PagedRows key={`${query}-${role}-${status}`} rows={visible} filtered={Boolean(query || role || status)} empty="Belum ada pengguna."
      render={(entry) => <DataRow key={entry.id} title={entry.name} description={entry.email}
        detail={[entry.id === actorId ? "Anda" : "", ...entry.roles.filter((id) => id !== "student").map((id) => id === "admin" ? "Admin" : "Tutor"), entry.status === "suspended" ? "Ditangguhkan" : ""].filter(Boolean).join(" · ")}
        onPress={() => { setEditing(undefined); setChosen(entry.id); }} testID={`academic-users-row-${entry.id}`} />} />
  </>;
}

function PackageFields({ packageType, changePackage, total, setTotal, weekly, setWeekly }: {
  packageType: PackageType; changePackage(next: PackageType): void;
  total: string; setTotal(next: string): void; weekly: string; setWeekly(next: string): void;
}) {
  return <>
    <Picker label="Paket" selected={packageType} options={packages} onSelect={(id) => changePackage(id as PackageType)} />
    {packageType === "custom" ? <View style={layout.group}>
      <Field label="Total kuota sesi" value={total} onChangeText={setTotal} keyboardType="number-pad" />
      <Field label="Batas sesi per minggu" value={weekly} onChangeText={setWeekly} keyboardType="number-pad" />
    </View> : <Ink kind="meta" tone="muted">{`${total} sesi · ${weekly} per minggu`}</Ink>}
  </>;
}

function usePackageDraft(existing?: { packageType: PackageType; total: number; weekly: number }) {
  const [packageType, setPackageType] = useState<PackageType>(existing?.packageType ?? "reguler_15");
  const [total, setTotal] = useState(String(existing?.total ?? 15));
  const [weekly, setWeekly] = useState(String(existing?.weekly ?? 1));
  function changePackage(next: PackageType) {
    setPackageType(next);
    if (next === "custom") return;
    setTotal(String(packagePresets[next].total));
    setWeekly(String(packagePresets[next].weekly));
  }
  return {
    controls: { packageType, changePackage, total, setTotal, weekly, setWeekly },
    fields: { packageType, total: numberValue(total), weekly: numberValue(weekly) },
  };
}

function GroupForm({ initial, linkedToken, onSave, onCancel }: {
  initial?: Group; linkedToken: boolean; onSave(fields: GroupFields): void; onCancel(): void;
}) {
  const presets = usePackageDraft(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [courseIds, setCourseIds] = useState(initial?.courseIds ?? []);
  const [year, setYear] = useState(initial?.year ?? "2026/2027");
  const [semester, setSemester] = useState<"Ganjil" | "Genap">(initial?.semester ?? "Ganjil");
  const [status, setStatus] = useState<GroupStatus>(initial?.status ?? "active");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return <Subheading title={initial ? "Edit kelompok" : "Buat kelompok"}>
    <Field label="Nama kelompok" value={name} onChangeText={setName} testID="academic-group-name" />
    <MultiChoice label="Mata kuliah" options={courseOptions} chosen={courseIds} change={setCourseIds} disabled={linkedToken} />
    <PackageFields {...presets.controls} />
    <Field label="Tahun ajaran" value={year} onChangeText={setYear} />
    <Picker label="Semester" options={[{ id: "Ganjil", label: "Ganjil" }, { id: "Genap", label: "Genap" }]}
      selected={semester} onSelect={(value) => setSemester(value as typeof semester)} />
    <Picker label="Status" options={groupStatusOptions} selected={status} onSelect={(value) => setStatus(value as GroupStatus)} />
    <Field label="Catatan" value={notes} onChangeText={setNotes} multiline />
    <SaveButtons onCancel={onCancel} onSave={() => onSave({ name, courseIds, ...presets.fields, year, semester, status, notes })} />
  </Subheading>;
}

export function AdministrationGroups() {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [course, setCourse] = useState("");
  const [packageType, setPackageType] = useState("");
  const [chosen, setChosen] = useState("");
  const [editing, setEditing] = useState<Group | "new">();
  const [memberQuery, setMemberQuery] = useState("");
  const group = records.groups.find((entry) => entry.id === chosen);
  const visible = records.groups.filter((entry) => matchWords(normalSearch(query), [entry.name, courseNames(entry.courseIds)])
    && (!status || entry.status === status) && (!course || entry.courseIds.includes(course)) && (!packageType || entry.packageType === packageType));
  const assigned = new Set(group?.members.map((member) => member.userId));
  const candidates = records.users.filter((entry) => entry.status === "active" && entry.roles.includes("student") && !assigned.has(entry.id)
    && matchWords(normalSearch(memberQuery), [entry.name, entry.email]));
  return <>
    <View style={layout.row}>
      <Action label="Buat kelompok" variation="default" onPress={() => { setChosen(""); setEditing("new"); }} testID="academic-group-create" />
    </View>
    {mutation.feedback}
    {editing ? <GroupForm key={editing === "new" ? editing : editing.id} initial={editing === "new" ? undefined : editing}
      linkedToken={editing !== "new" && records.tokens.some((token) => token.groupId === editing.id)}
      onCancel={() => setEditing(undefined)} onSave={(fields) => {
        const initial = editing === "new" ? undefined : editing;
        mutation.run({ type: "group.save", ...idAndRevision(initial), fields }, {
          success: initial ? "Kelompok diperbarui." : "Kelompok dibuat.", after: () => setEditing(undefined),
          review: () => {
            const current = initial && records.groups.find((entry) => entry.id === initial.id);
            return current ? <Ink>{`${current.name} · ${current.total} sesi, ${current.weekly} per minggu`}</Ink> : null;
          },
        });
      }} /> : null}
    {group && !editing ? <Subheading title={group.name} action={<Action label="Tutup" onPress={() => setChosen("")} />}>
      <Ink>{courseNames(group.courseIds)}</Ink>
      <Ink kind="meta" tone="muted">{`${packagePresets[group.packageType].title} · ${group.used}/${group.total} sesi · ${group.weekly} per minggu`}</Ink>
      {group.notes ? <Ink>{group.notes}</Ink> : null}
      <View style={layout.row}>
        <Action label="Edit kelompok" onPress={() => setEditing(group)} />
        <Action label="Hapus kelompok" variation="destructive" onPress={() => mutation.run(
          { type: "group.delete", id: group.id, revision: group.revision },
          { title: "Hapus kelompok?", description: `${group.name} beserta token dan sesi terkait akan dihapus.`, destructive: true,
            confirmLabel: "Hapus kelompok", success: "Kelompok dihapus.", after: () => setChosen("") },
        )} />
      </View>
      <Ink kind="strong">{`Anggota (${group.members.length})`}</Ink>
      {group.members.map((member) => {
        const user = records.users.find((entry) => entry.id === member.userId);
        if (!user) return null;
        return <DataRow key={user.id} title={user.name} description={member.role === "leader" ? "Ketua" : "Anggota"}
          detail="Keluarkan" onPress={() => mutation.run(
            { type: "group.member", id: group.id, revision: group.revision, userId: user.id, action: "remove" },
            { title: "Keluarkan anggota?", description: `${user.name} akan dikeluarkan dari ${group.name}.`,
              destructive: true, confirmLabel: "Keluarkan", success: "Anggota dikeluarkan." },
          )} />;
      })}
      <SearchBox label="Cari peserta untuk ditambahkan" value={memberQuery} onChange={setMemberQuery} />
      {memberQuery.trim() ? <PagedRows rows={candidates} filtered empty="Belum ada peserta."
        render={(user) => <DataRow key={user.id} title={user.name} description={user.email} detail="Tambah" onPress={() => mutation.run(
          { type: "group.member", id: group.id, revision: group.revision, userId: user.id, action: "add" },
          { success: "Anggota ditambahkan.", after: () => setMemberQuery("") },
        )} />} /> : null}
    </Subheading> : null}
    <SearchBox label="Cari kelompok" value={query} onChange={setQuery} />
    <View style={layout.row}>
      <Picker label="Status" options={allOptions("Semua status", groupStatusOptions)} selected={status} onSelect={setStatus} />
      <Picker label="Paket" options={allOptions("Semua paket", packages)} selected={packageType} onSelect={setPackageType} />
      <Picker label="Mata kuliah" options={allOptions("Semua mata kuliah", courseOptions)} selected={course} onSelect={setCourse} />
    </View>
    <PagedRows key={`${query}-${status}-${course}-${packageType}`} rows={visible} empty="Belum ada kelompok belajar." filtered={Boolean(query || status || course || packageType)}
      render={(entry) => <DataRow key={entry.id} title={entry.name} description={courseNames(entry.courseIds)}
        detail={`${entry.members.length} anggota · ${groupStatusOptions.find((option) => option.id === entry.status)?.label}`}
        testID={`academic-group-row-${entry.id}`} onPress={() => { setEditing(undefined); setChosen(entry.id); setMemberQuery(""); }} />} />
  </>;
}

function TokenForm({ onSave, onCancel }: { onSave(fields: TokenFields): void; onCancel(): void }) {
  const [capacity, setCapacity] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const presets = usePackageDraft();
  return <Subheading title="Buat token pendaftaran">
    <Field label="Kapasitas kelompok" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" testID="academic-token-capacity" />
    <MultiChoice label="Mata kuliah" options={courseOptions} chosen={courseIds} change={setCourseIds} />
    <PackageFields {...presets.controls} />
    <SaveButtons saveLabel="Buat token" onCancel={onCancel} onSave={() => onSave({ courseIds, capacity: numberValue(capacity), ...presets.fields })} />
  </Subheading>;
}

export function AdministrationTokens() {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const [creating, setCreating] = useState(false);
  const [chosen, setChosen] = useState("");
  const token = records.tokens.find((entry) => entry.id === chosen);
  const visible = records.tokens.filter((entry) => matchWords(normalSearch(search), [entry.code, courseNames(entry.courseIds)]) && (!course || entry.courseIds.includes(course)));
  return <>
    <View style={layout.row}><Action label="Buat token" variation="default" onPress={() => { setChosen(""); setCreating(true); }} testID="academic-token-create" /></View>
    {mutation.feedback}
    {creating ? <TokenForm onCancel={() => setCreating(false)} onSave={(fields) => mutation.run({ type: "token.create", fields }, {
      success: "Token pendaftaran dibuat.", after: () => setCreating(false),
    })} /> : null}
    <SearchBox label="Cari token" value={search} onChange={setSearch} />
    <Picker label="Mata kuliah" options={allOptions("Semua mata kuliah", courseOptions)} selected={course} onSelect={setCourse} />
    <PagedRows key={`${search}-${course}`} rows={visible} empty="Belum ada token pendaftaran." filtered={Boolean(search || course)}
      render={(entry) => <DataRow key={entry.id} title={entry.code} description={courseNames(entry.courseIds)}
        detail={`${entry.used}/${entry.capacity} terpakai`} onPress={() => setChosen(entry.id)} />} />
    {token ? <CourseDialog title={token.code} onClose={() => setChosen("")}>
      <Ink>{courseNames(token.courseIds)}</Ink>
      <Ink>{`Kedaluwarsa ${dateLabel(token.expires)}`}</Ink>
      <Ink>{`${token.total} sesi · ${token.weekly} per minggu`}</Ink>
      <Action label="Hapus token" variation="destructive" onPress={() => {
        setChosen("");
        mutation.run({ type: "token.delete", id: token.id, revision: token.revision }, {
          title: "Hapus token?", description: `Token ${token.code}, kelompok, dan sesi terkait akan dihapus.`,
          confirmLabel: "Hapus token", destructive: true, success: "Token dihapus.",
        });
      }} />
    </CourseDialog> : null}
  </>;
}
