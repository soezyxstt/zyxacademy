import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  broadcastBodyLimit, broadcastLinkLimit, broadcastTargets, broadcastTitleLimit,
  type BroadcastComposeData, type BroadcastDraft, type BroadcastReceipt,
} from "../../../../../packages/academic/admin-broadcast";
import type { AcademicTransport } from "../client";
import { readBroadcast, submitBroadcast, type BroadcastCommand } from "./broadcast-client";
import { Action, CourseDialog, Field, Ink, Picker, layout } from "./ui";

const initialDraft: BroadcastDraft = { title: "", body: "", link: "", target: "all", targetId: "" };
const targetOptions = [
  { id: "all", label: "Semua pengguna" }, { id: "course", label: "Mata kuliah" }, { id: "user", label: "Pengguna tertentu" },
];
const statusLabels = {
  prepared: "Periksa pesan sebelum mengirim.",
  queued: "Notifikasi masuk antrean.",
  running: "Notifikasi sedang diproses.",
  succeeded: "Pengiriman selesai.",
  failed: "Pengiriman batal sebelum dimulai.",
  unknown: "Hasil pengiriman belum diketahui. Periksa riwayat sebelum membuat pengiriman baru.",
  cancelled: "Tinjauan dibatalkan.",
} satisfies Record<BroadcastReceipt["status"], string>;
const issueLabels = {
  audience_changed: "Daftar penerima berubah. Tinjau ulang sebelum mengirim.",
  preview_expired: "Tinjauan kedaluwarsa. Tinjau ulang sebelum mengirim.",
  authorization_expired: "Sesi Admin berakhir sebelum pengiriman dimulai.",
  partial: "Sebagian pengiriman bermasalah. Periksa riwayat.",
  delivery_uncertain: statusLabels.unknown,
} satisfies Record<NonNullable<BroadcastReceipt["issue"]>, string>;

type Pending = { command: BroadcastCommand; requestId: string };
const pendingCommands = new WeakMap<AcademicTransport, Pending>();

export function BroadcastComposer({ transport, close, refreshHistory }: {
  transport: AcademicTransport; close(): void; refreshHistory(): void;
}) {
  const [data, setData] = useState<BroadcastComposeData>();
  const [draft, setDraft] = useState(initialDraft);
  const [drafting, setDrafting] = useState(false);
  const [pending, setPending] = useState(() => pendingCommands.get(transport));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);

  function begin() {
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    return controller;
  }

  function end(controller: AbortController) {
    if (active.current === controller) active.current = undefined;
    if (!controller.signal.aborted) setBusy(false);
  }

  async function reload() {
    if (active.current) return;
    const controller = begin();
    try {
      const result = await readBroadcast(transport, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "ready") setData(result.data);
      else if (result.status === "denied") {
        setData(undefined);
        setError("Akses Admin diperlukan. Periksa sesi Anda.");
      } else setError("Status pengiriman gagal dimuat.");
    } catch {
      if (!controller.signal.aborted) setError("Status pengiriman gagal dimuat.");
    } finally {
      end(controller);
    }
  }

  useEffect(() => {
    void reload();
    return () => {
      active.current?.abort();
      active.current = undefined;
    };
  }, [transport]);

  async function submit(next: Pending) {
    if (active.current) return;
    pendingCommands.set(transport, next);
    setPending(next);
    const controller = begin();
    try {
      const result = await submitBroadcast(transport, next.command, next.requestId, controller.signal);
      if (controller.signal.aborted || result.status === "unknown") return;
      pendingCommands.delete(transport);
      setPending(undefined);
      if (result.status === "saved") {
        setData(value => ({ courses: value?.courses ?? [], receipt: result.receipt }));
        setDrafting(next.command.action === "discard" && result.receipt.status === "cancelled" && !result.receipt.issue);
        return;
      }
      if (result.status === "denied" || result.status === "refresh") setData(undefined);
      if (result.status === "denied") setError("Akses Admin diperlukan. Periksa sesi Anda.");
      if (result.status === "refresh") setError("Permintaan berubah. Periksa status terbaru.");
      if (result.status === "empty") setError("Tidak ada penerima untuk pilihan ini.");
      if (result.status === "invalid") setError("Periksa judul, isi, penerima, dan tautan internal.");
    } catch {
      // The same request ID remains available if the response was interrupted.
    } finally {
      end(controller);
    }
  }

  const receipt = drafting ? null : data?.receipt;
  const field = (key: keyof Omit<BroadcastDraft, "target">, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const transition = (action: "confirm" | "discard", id: string) => void submit({ command: { action, id }, requestId: id });
  const validDraft = !!draft.title.trim() && !!draft.body.trim() && (draft.target === "all" || !!draft.targetId.trim());
  const status = receipt?.status;
  const terminal = status === "succeeded" || status === "failed" || status === "unknown" || status === "cancelled";

  return <CourseDialog title="Tulis notifikasi" onClose={close} dismissDisabled={busy} testID="academic-live-broadcast">
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
    {!data && !pending ? <>
      <Ink>{busy ? "Memuat pengiriman…" : "Status belum tersedia."}</Ink>
      {!busy ? <Action label="Periksa status" onPress={() => void reload()} /> : null}
    </> : null}
    {pending ? <View style={layout.group} accessibilityLiveRegion="polite">
      <Ink>{busy ? "Memproses permintaan…" : "Hasil permintaan belum diterima."}</Ink>
      {!busy ? <Action label="Periksa dengan permintaan yang sama" onPress={() => void submit(pending)} /> : null}
    </View> : null}
    {data && !pending && !receipt ? <>
      <Picker label="Penerima" options={targetOptions} selected={draft.target} onSelect={(value) => {
        const target = broadcastTargets.find(item => item === value);
        if (target) setDraft(previous => ({ ...previous, target, targetId: "" }));
      }} />
      {draft.target === "course" ? <Picker label="Pilih mata kuliah" options={data.courses.map(({ id, title }) => ({ id, label: title }))}
        selected={draft.targetId} onSelect={id => field("targetId", id)} /> : null}
      {draft.target === "user" ? <Field label="ID pengguna" value={draft.targetId} maxLength={256} autoCapitalize="none"
        onChangeText={value => field("targetId", value)} /> : null}
      <Field label="Judul notifikasi" value={draft.title} maxLength={broadcastTitleLimit}
        onChangeText={value => field("title", value)} testID="academic-live-broadcast-title" />
      <Field label="Isi notifikasi" value={draft.body} maxLength={broadcastBodyLimit} multiline
        onChangeText={value => field("body", value)} testID="academic-live-broadcast-message" />
      <Field label="Tautan internal" value={draft.link} placeholder="/dashboard" maxLength={broadcastLinkLimit} autoCapitalize="none"
        onChangeText={value => field("link", value)} />
      <Action label="Tinjau penerima" variation="default" disabled={!validDraft || busy} testID="academic-live-broadcast-prepare"
        onPress={() => void submit({ command: { action: "prepare", draft }, requestId: randomUUID() })} />
    </> : null}
    {receipt && !pending ? <>
      <Ink kind="strong">{receipt.draft.title}</Ink>
      <Ink>{receipt.draft.body}</Ink>
      <Ink>{`${receipt.audience} · ${receipt.recipientCount} penerima`}</Ink>
      <Ink kind="meta" tone="muted">{`Kotak masuk dan push · ${receipt.draft.link}`}</Ink>
      <View accessibilityLiveRegion="polite" style={layout.group}>
        <Ink>{statusLabels[receipt.status]}</Ink>
        {receipt.issue && receipt.issue !== "delivery_uncertain" ? <Ink tone="error">{issueLabels[receipt.issue]}</Ink> : null}
        {status === "succeeded" ? <Ink>{`Push berhasil ${receipt.succeeded ?? 0} dari ${receipt.attempted ?? 0} percobaan · ${receipt.failedCount ?? 0} token gagal`}</Ink> : null}
      </View>
      <View style={layout.row}>
        {status === "prepared" ? <>
          <Action label="Kirim notifikasi" variation="default" disabled={busy} onPress={() => transition("confirm", receipt.id)} testID="academic-live-broadcast-confirm" />
          <Action label="Ubah pesan" disabled={busy} onPress={() => {
            setDraft(receipt.draft);
            transition("discard", receipt.id);
          }} />
        </> : null}
        {status === "queued" || status === "running" ? <Action label="Perbarui status" disabled={busy} onPress={() => void reload()} /> : null}
        {terminal ? <>
          <Action label="Lihat riwayat" onPress={refreshHistory} />
          <Action label={status === "failed" || status === "cancelled" ? "Tinjau ulang" : "Tulis pesan baru"}
            onPress={() => {
              setDraft(status === "failed" || status === "cancelled" ? receipt.draft : initialDraft);
              setDrafting(true);
            }} />
        </> : null}
      </View>
    </> : null}
  </CourseDialog>;
}
