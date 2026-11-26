import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  validateEnrollmentTokenIssue, type EnrollmentTokenDetails, type EnrollmentTokenEditor, type EnrollmentTokenWrite,
} from "../../../../../packages/academic/enrollment-token-admin";
import type { AcademicTransport } from "../client";
import { AdministrationReadError } from "./live-client";
import { readEnrollmentTokenEditor, saveEnrollmentToken } from "./enrollment-token-client";
import {
  Action, CourseDialog, CourseStatus, Field, Ink, MultiChoice, Picker, SaveButtons, SearchBox, dateTimeLabel,
  layout, normalSearch, numberValue,
} from "./ui";

type Pending = { command: EnrollmentTokenWrite; requestId: string };
const pendingTokens = new WeakMap<AcademicTransport, Map<string, Pending>>();
const presets = [
  { id: "reguler", label: "Reguler", quota: 15 },
  { id: "intensif", label: "Intensif", quota: 30 },
  { id: "super", label: "Super intensif", quota: 45 },
  { id: "custom", label: "Kustom", quota: undefined },
] as const;

export function LiveEnrollmentTokenEditor({ id, reference, transport, cancel, saved }: {
  id?: string; reference?: string; transport: AcademicTransport; cancel(): void; saved(): void;
}) {
  const [state, setState] = useState<{ data?: EnrollmentTokenEditor; error?: string; retry?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readEnrollmentTokenEditor(transport, id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof AdministrationReadError) {
        if (error.status === 401 || error.status === 403) return setState({ error: "Akses admin diperlukan. Periksa sesi Anda." });
        if (error.status === 404) return setState({ error: "Token tidak tersedia." });
      }
      setState({ error: "Data token gagal dimuat.", retry: true });
    });
    return () => controller.abort();
  }, [id, transport, attempt]);

  if (state.data) return <TokenForm data={state.data} reference={reference} transport={transport} cancel={cancel} saved={saved} />;
  return <CourseDialog title={id ? "Cabut token" : "Buat token"} onClose={cancel}>
    {state.error ? <CourseStatus label={state.error} error retry={state.retry ? () => {
      setState({});
      setAttempt(attempt + 1);
    } : undefined} /> : <CourseStatus label="Memuat data token…" />}
  </CourseDialog>;
}

function TokenForm({ data, reference, transport, cancel, saved }: {
  data: EnrollmentTokenEditor; reference?: string; transport: AcademicTransport; cancel(): void; saved(): void;
}) {
  const editing = data.type === "token";
  const key = editing ? data.token.id : "issue";
  const recovered = pendingTokens.get(transport)?.get(key);
  const previous = recovered?.command.type === "issue" ? recovered.command.fields : undefined;
  const [current, setCurrent] = useState(editing ? data.token : undefined);
  const [capacity, setCapacity] = useState(previous ? String(previous.capacity) : "");
  const [total, setTotal] = useState(String(previous?.totalQuotaSessions ?? 15));
  const [weekly, setWeekly] = useState(String(previous?.weeklyQuotaSessions ?? 15));
  const [courseIds, setCourseIds] = useState<string[]>(previous?.courseIds ?? []);
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState(previous ? "custom" : "reguler");
  const [conflict, setConflict] = useState<EnrollmentTokenDetails>();
  const [uncertain, setUncertain] = useState<Pending | undefined>(recovered);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), [transport]);

  const courses = data.type === "issue" ? data.courses : [];
  const chosen = new Set(courseIds);
  const courseChoices = [
    ...courses.filter((course) => chosen.has(course.id)),
    ...courses.filter((course) => !chosen.has(course.id) && normalSearch(course.title).includes(normalSearch(query))).slice(0, 60),
  ].map((course) => ({ id: course.id, label: course.title }));

  function submit(pending: Pending) {
    if (active.current) return;
    let requests = pendingTokens.get(transport);
    if (!requests) {
      requests = new Map();
      pendingTokens.set(transport, requests);
    }
    const scope = requests;
    scope.set(key, pending);
    const controller = new AbortController();
    active.current = controller;
    setError("");
    setBusy(true);
    saveEnrollmentToken(transport, pending.command, pending.requestId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "uncertain") { setUncertain(pending); return; }
      if (scope.get(key) === pending) scope.delete(key);
      setUncertain(undefined);
      if (result.status === "saved") saved();
      else if (result.status === "conflict") setConflict(result.token);
      else setError(result.message);
    }).catch(() => {
      if (!controller.signal.aborted) setUncertain(pending);
    }).finally(() => {
      if (active.current === controller) active.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    });
  }

  function issue() {
    const fields = { courseIds, capacity: numberValue(capacity), totalQuotaSessions: numberValue(total), weeklyQuotaSessions: numberValue(weekly) };
    const validation = validateEnrollmentTokenIssue(fields);
    if (validation) { setError(validation); return; }
    submit({ command: { type: "issue", fields }, requestId: randomUUID() });
  }

  function revoke() {
    if (current?.status !== "active") return;
    submit({ command: { type: "revoke", id: current.id, fields: { expectedRevision: current.revision } }, requestId: randomUUID() });
  }

  const disabled = busy || Boolean(uncertain);
  return <CourseDialog title={current?.status === "active" ? "Cabut token pendaftaran?" : editing ? "Status token pendaftaran" : "Buat token pendaftaran"} onClose={cancel} dismissDisabled={busy}>
    {current ? <>
      {reference ? <Ink kind="strong">{reference}</Ink> : null}
      <Ink>{(conflict ?? current).courses.map((course) => course.title).join(", ") || "Belum ada mata kuliah"}</Ink>
      <Ink>{`${(conflict ?? current).used}/${(conflict ?? current).capacity} terpakai`}</Ink>
      <Ink>{`Kedaluwarsa ${dateTimeLabel((conflict ?? current).expiresAt)}`}</Ink>
      <Ink>{(conflict ?? current).status === "active" ? "Pendaftaran baru berakhir saat token dicabut." : "Token sudah kedaluwarsa."}</Ink>
    </> : <>
      <Field label="Kapasitas kelompok" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" editable={!disabled} testID="academic-live-token-capacity" />
      <Picker label="Paket" options={presets} selected={preset} onSelect={(id) => {
        if (disabled) return;
        const choice = presets.find((entry) => entry.id === id);
        if (!choice) return;
        setPreset(choice.id);
        if (choice.quota !== undefined) { setTotal(String(choice.quota)); setWeekly(String(choice.quota)); }
      }} />
      {preset === "custom" ? <>
        <Field label="Total kuota sesi" value={total} onChangeText={setTotal} keyboardType="number-pad" editable={!disabled} />
        <Field label="Batas sesi per minggu" value={weekly} onChangeText={setWeekly} keyboardType="number-pad" editable={!disabled} />
      </> : <Ink kind="meta" tone="muted">{`${total} sesi · ${weekly} per minggu`}</Ink>}
      {courses.length > 8 ? <SearchBox label="Cari mata kuliah" value={query} onChange={setQuery} /> : null}
      <MultiChoice label="Mata kuliah" options={courseChoices} chosen={courseIds} change={setCourseIds} disabled={disabled} />
      {!courseChoices.length ? <Ink kind="meta" tone="muted">Mata kuliah aktif tidak ditemukan.</Ink> : null}
    </>}
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
    {conflict ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink tone="error">Data token berubah. Tinjau data terbaru.</Ink>
      <View style={layout.row}>
        <Action label="Gunakan revisi terbaru" onPress={() => { setCurrent(conflict); setConflict(undefined); }} />
        <Action label="Batal" onPress={cancel} />
      </View>
    </View> : null}
    {uncertain ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink>Hasil permintaan belum diketahui.</Ink>
      <View style={layout.row}>
        <Action label="Periksa dengan percobaan ulang" onPress={() => submit(uncertain)} disabled={busy} />
        <Action label="Tutup" onPress={cancel} disabled={busy} />
      </View>
    </View> : null}
    {!editing && !uncertain ? <SaveButtons saveLabel="Buat token" onSave={issue} onCancel={cancel} busy={busy} /> : null}
    {editing && !uncertain && !conflict && current?.status === "active" ? <View style={layout.row}>
      <Action label="Cabut token" variation="destructive" onPress={revoke} disabled={busy} testID="academic-live-token-revoke-confirm" />
      <Action label="Batal" onPress={cancel} disabled={busy} />
    </View> : null}
  </CourseDialog>;
}
