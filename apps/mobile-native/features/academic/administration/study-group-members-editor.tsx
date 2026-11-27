import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { StudyGroupMemberEdit, StudyGroupPerson } from "../../../../../packages/academic/study-group-members";
import type { AcademicTransport } from "../client";
import { readStudyGroupMembers, writeStudyGroupMember } from "./study-group-members-client";
import { Action, CourseDialog, Ink, SearchBox, layout } from "./ui";

type Pending = { draft: StudyGroupMemberEdit; requestId: string };
type ReadResult = Awaited<ReturnType<typeof readStudyGroupMembers>>;
const pendingEdits = new WeakMap<AcademicTransport, Map<string, Pending>>();

export function StudyGroupMembersEditor({ id, transport, close, denied, saved }: {
  id: string; transport: AcademicTransport; close(): void; denied(): void; saved(): void;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [attempt, bump] = useState(0);
  const [result, setResult] = useState<{ transport: AcademicTransport; key: string; state: ReadResult }>();
  const [pending, setPending] = useState(() => pendingEdits.get(transport)?.get(id));
  const [confirmation, setConfirmation] = useState<Pending>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const readKey = JSON.stringify([id, page, search, attempt, pending?.requestId]);
  const current = result?.transport === transport && result.key === readKey ? result.state : undefined;
  const data = current?.status === "ready" ? current.data : undefined;

  const latestDenied = useRef(denied);
  latestDenied.current = denied;
  useEffect(() => {
    const controller = new AbortController();
    const recovery = pending?.draft.accountId === transport.accountId ? { ...pending.draft, requestId: pending.requestId } : undefined;
    readStudyGroupMembers(transport, id, page, search, controller.signal, recovery).then((state) => {
      if (controller.signal.aborted) return;
      setResult({ transport, key: readKey, state });
      if (state.status === "denied") latestDenied.current();
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ transport, key: readKey, state: { status: "error" } });
    });
    return () => controller.abort();
  }, [transport, id, page, search, readKey, pending]);
  useEffect(() => () => { inFlight.current?.abort(); inFlight.current = undefined; }, [transport, id]);

  function select(person: StudyGroupPerson, action: "add" | "remove") {
    if (!data) return;
    setMessage("");
    setConfirmation({ requestId: randomUUID(), draft: {
      accountId: transport.accountId, userId: person.id, action, expectedRevision: data.revision,
    } });
  }

  const selected = pending ?? confirmation;
  const removing = selected?.draft.action === "remove";
  const selectedPerson = selected && data && (pending ? data.recoveryTarget
    : (removing ? data.members : data.candidates).find((person) => person.id === selected.draft.userId));

  async function submit(command: Pending) {
    if (inFlight.current || selectedPerson?.id !== command.draft.userId || selected?.requestId !== command.requestId) return;
    const commands = pendingEdits.get(transport) ?? new Map<string, Pending>();
    pendingEdits.set(transport, commands);
    commands.set(id, command);
    setBusy(true);
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const result = await writeStudyGroupMember(transport, id, command.draft, command.requestId, controller.signal);
      if (controller.signal.aborted) return;
      if (result === "uncertain") { recover(); return; }
      if (commands.get(id) === command) commands.delete(id);
      setPending(undefined);
      setConfirmation(undefined);
      if (result === "denied") { denied(); return; }
      if (result === "saved") {
        setMessage(command.draft.action === "add" ? "Anggota ditambahkan." : "Anggota dikeluarkan.");
        setPage(1);
        saved();
      } else {
        setMessage(result === "stale" ? "Data kelompok berubah. Tinjau daftar terbaru sebelum mencoba lagi." : "Perubahan anggota tidak dapat dilakukan.");
      }
      bump((value) => value + 1);
    } catch {
      if (!controller.signal.aborted) recover();
    } finally {
      if (inFlight.current === controller) inFlight.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
    function recover() {
      setConfirmation(undefined);
      setPending(command);
      bump((value) => value + 1);
    }
  }

  return <CourseDialog title={selectedPerson ? removing ? "Keluarkan anggota" : "Tambah anggota" : "Anggota kelompok"} onClose={close} dismissDisabled={busy}>
    {data?.name ? <Ink kind="strong">{data.name}</Ink> : null}
    {selected && selectedPerson ? <>
      <Ink kind="strong">{selectedPerson.name}</Ink><Ink>{selectedPerson.email}</Ink>
      {removing ? <Ink>Akses kursus mengikuti masa berlaku yang tersimpan.</Ink> : <Ink>Akses baru mengikuti masa berlaku kelompok.</Ink>}
      {pending && !busy ? <View accessibilityLiveRegion="polite"><Ink>Hasil perubahan belum diketahui.</Ink></View> : null}
      <View style={layout.row}>
        <Action label={pending ? "Tutup" : "Batal"} onPress={pending ? close : () => setConfirmation(undefined)} disabled={busy} />
        <Action label={busy ? "Menyimpan…" : pending ? "Periksa dengan percobaan ulang" : removing ? "Keluarkan" : "Tambahkan"}
          variation={removing ? "destructive" : "default"} disabled={busy} onPress={() => void submit(selected)} />
      </View>
    </> : <>
      {message ? <View accessibilityLiveRegion="polite"><Ink>{message}</Ink></View> : null}
      {!current ? <Ink>Memuat anggota…</Ink> : null}
      {current?.status === "error" ? <View style={layout.row}><Ink>Daftar anggota gagal dimuat.</Ink><Action label="Muat ulang anggota" onPress={() => bump((value) => value + 1)} /></View> : null}
      {current?.status === "missing" ? <Ink>Kelompok tidak ditemukan.</Ink> : null}
      {current?.status === "denied" ? <Ink>Akses admin diperlukan.</Ink> : null}
      {data && pending ? <View style={layout.row}>
        <Ink>Target percobaan ulang tidak tersedia.</Ink>
        <Action label="Kembali ke daftar" onPress={() => { pendingEdits.get(transport)?.delete(id); setPending(undefined); }} />
      </View> : null}
      {data && !pending ? <>
        {data.canAdd ? <View style={layout.row}>
          <View style={layout.flex}><SearchBox label="Nama atau email" value={query} onChange={setQuery} /></View>
          <Action label="Cari peserta" disabled={query.trim().length < 2} onPress={() => setSearch(query.trim())} />
        </View> : null}
        {search && data.canAdd ? <>
          {data.candidates.length ? data.candidates.map((person) => <View key={person.id} style={layout.row}>
            <View style={layout.flex}><Ink kind="strong">{person.name}</Ink><Ink kind="meta">{person.email}</Ink></View>
            <Action label="Tambah" onPress={() => select(person, "add")} />
          </View>) : <Ink>Peserta tidak ditemukan.</Ink>}
        </> : null}
        {data.members.length ? data.members.map((person) => <View key={person.membershipId} style={layout.row}>
          <View style={layout.flex}><Ink kind="strong">{person.name}</Ink><Ink kind="meta">{person.email}</Ink>{person.role === "leader" ? <Ink kind="meta">Ketua</Ink> : null}</View>
          <Action label="Keluarkan" onPress={() => select(person, "remove")} />
        </View>) : <Ink>Belum ada anggota.</Ink>}
        {page > 1 || data.nextPage ? <View style={layout.row}>
          <Action label="Sebelumnya" disabled={page <= 1} onPress={() => setPage(page - 1)} />
          <Action label="Berikutnya" disabled={!data.nextPage} onPress={() => setPage(page + 1)} />
        </View> : null}
      </> : null}
    </>}
  </CourseDialog>;
}
