import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import type { AcademicTransport } from "../client";
import { Action, CourseDialog, Ink } from "./ui";
import { provisionScheduledMeets, type MeetProgress } from "./schedule-meet-client";

export function ScheduleMeet({ transport, refresh }: { transport: AcademicTransport; refresh(): void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState<MeetProgress>();
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [transport]);
  function close() {
    pending.current?.abort();
    pending.current = null;
    setRunning(false); setOpen(false);
    if (counts || error) refresh();
  }
  async function create() {
    if (pending.current) return;
    const task = new AbortController();
    pending.current = task;
    setRunning(true); setError("");
    try {
      const result = await provisionScheduledMeets(transport, task.signal, randomUUID, setCounts);
      if (!task.signal.aborted) setCounts(result);
    } catch (cause) {
      if (!task.signal.aborted) setError(cause instanceof Error && cause.message === "FORBIDDEN" ? "Akses Admin diperlukan." : "Proses terputus. Periksa kembali jadwal yang masih memerlukan tautan.");
    } finally {
      if (pending.current === task) { pending.current = null; setRunning(false); }
    }
  }
  return <>
    <Action label="Buat tautan Meet" onPress={() => { setCounts(undefined); setError(""); setOpen(true); }} />
    {open && <CourseDialog title="Buat tautan Meet" onClose={close}>
      {!counts && !error && <Ink>{running ? "Memeriksa jadwal tutorial daring." : "Buat tautan untuk semua sesi tutorial daring terjadwal yang belum memiliki tautan?"}</Ink>}
      {counts && <>
        <Ink>{`${counts.ready} tautan siap · ${counts.changed} jadwal berubah`}</Ink>
        {counts.rejected > 0 && <Ink tone="error">{`${counts.rejected} permintaan ditolak Google. Periksa akses akun Meet sebelum mencoba lagi.`}</Ink>}
        {counts.uncertain > 0 && <Ink tone="error">{`${counts.uncertain} hasil belum pasti. Periksa riwayat Meet sebelum membuat ruang lain.`}</Ink>}
      </>}
      {error ? <Ink tone="error">{error}</Ink> : null}
      {!counts && !running && !error && <Action label="Buat tautan" variation="default" onPress={create} />}
      <Action label={running ? "Hentikan setelah sesi ini" : "Tutup"} onPress={close} />
    </CourseDialog>}
  </>;
}
