import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { CalendarCommand, CalendarEditor } from "../../../../../packages/academic/tutor-calendar";
import type { TutorScheduleData, TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { SharedDialog } from "../../shared-ui";
import { Choices, Label, tutorLayout, type TutorTheme } from "./ui";

type Mode = CalendarCommand["action"];
const labels: Record<Mode, string> = { copy: "Salin minggu sebelumnya", move: "Pindahkan sesi", delete: "Hapus slot" };
type Props = { data: TutorScheduleData; week: number; editor: CalendarEditor; schedule: TutorSupportClient["schedule"];
  theme: TutorTheme; refresh(): Promise<void>; denied(): void };

export function CalendarActions({ data, week, editor, schedule, theme, refresh, denied }: Props) {
  const { canInteract } = useProtectedInteraction();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("copy");
  const [selected, setSelected] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [destinationWeek, setDestinationWeek] = useState(week);
  const [loaded, setLoaded] = useState<{ week: number; data?: TutorScheduleData }>();
  const [fetchAttempt, setFetchAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), [editor]);
  useEffect(() => {
    if (!open || mode !== "move" || destinationWeek === week) return;
    const controller = new AbortController();
    const settle = (result: { week: number; data?: TutorScheduleData }) => { if (!controller.signal.aborted) setLoaded(result); };
    schedule(destinationWeek, controller.signal).then(result => settle({ week: destinationWeek, data: result }), (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof TutorDataError && [401, 403].includes(error.status)) denied();
      else settle({ week: destinationWeek });
    });
    return () => controller.abort();
  }, [schedule, destinationWeek, week, mode, open, fetchAttempt]); // Permission errors unmount the current schedule.
  const slots = data.slots.filter(slot => slot.revision && !slot.booked && !slot.hasBookingHistory);
  const sessions = data.sessions.filter(session => session.slotId && (session.status === "scheduled" || session.status === "rescheduled"));
  const slot = slots.find(item => item.id === selected);
  const booking = sessions.find(item => item.id === selected);
  const destination = destinationWeek === week ? data : loaded?.week === destinationWeek ? loaded.data : undefined;
  const targets = destination?.slots.filter(item => !item.booked && item.id !== booking?.slotId) ?? [];
  const newSlot = targets.find(item => item.id === target);
  const pending = editor.pending();
  const command: CalendarCommand | undefined = mode === "copy" ? { action: mode, week: data.from }
    : mode === "delete" && slot?.revision ? { action: mode, slotId: slot.id, expectedRevision: slot.revision, confirmed: true }
    : mode === "move" && booking?.slotId && newSlot ? { action: mode, bookingId: booking.id, expectedSlotId: booking.slotId,
        targetSlotId: newSlot.id, date: newSlot.date, reason: reason.trim() } : undefined;
  async function submit() {
    const draft = pending ?? (command ? { command, requestId: randomUUID() } : undefined);
    if (!draft || current.current || !canInteract()) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    try {
      const result = await editor.save(draft, controller.signal);
      if (controller.signal.aborted || !canInteract()) return;
      if (typeof result !== "string") {
        setOpen(false);
        setNotice(result.action === "delete" ? "Slot dihapus." : result.action === "move" ?
          (result.moved ? "Sesi dipindahkan." : "Jadwal terkunci. Tiket penjadwalan ulang diajukan.") :
          `${result.created} slot disalin, ${result.skipped} dilewati.`);
        await refresh();
      } else if (result === "denied") denied();
      else if (result === "conflict") { setOpen(false); setNotice("Jadwal berubah atau tindakan ini tidak tersedia. Periksa jadwal terbaru."); await refresh(); }
      else setNotice(result === "invalid" ? "Periksa pilihan jadwal." : "Hasil pengiriman belum diketahui.");
    } finally {
      current.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function change(next: Mode) { setMode(next); setTarget(""); setSelected(""); setReason(""); setDestinationWeek(week); setNotice(""); }
  return <View style={tutorLayout.group}>
    <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => { change(pending?.command.action ?? "copy"); setOpen(true); }}>
      {pending ? "Periksa perubahan jadwal" : "Kelola jadwal"}</Button>
    {!open && notice ? <Label theme={theme}>{notice}</Label> : null}
    <SharedDialog open={open} title="Kelola jadwal" theme={theme} closeLabel="Kembali" onDismiss={() => setOpen(false)}
      dismissDisabled={busy} dismissOnBackdrop={false} testID="tutor-calendar-actions">
      {pending ? <Label theme={theme}>{labels[pending.command.action]}</Label> : <>
        <Choices<Mode> theme={theme} label="Tindakan jadwal" options={[["copy", labels.copy], ["delete", labels.delete], ["move", labels.move]]}
          value={mode} change={change} disabled={busy} />
        {mode === "copy" ? <Label theme={theme}>Salin slot ketersediaan minggu sebelumnya ke {data.from} sampai {data.to}.</Label> : null}
        {mode === "delete" ? slots.length ? <Choices theme={theme} label="Slot yang akan dihapus" value={selected} change={setSelected}
          disabled={busy} options={slots.map(item => [item.id, `${item.date} · ${item.start}`] as const)} /> :
          <Label theme={theme}>Tidak ada slot yang dapat dihapus minggu ini.</Label> : null}
        {mode === "move" ? <>
          {sessions.length ? <Choices theme={theme} label="Sesi yang akan dipindah" value={selected} change={setSelected} disabled={busy}
            options={sessions.map(item => [item.id, [item.date, item.start, item.groupName, item.courseTitle].filter(Boolean).join(" · ")] as const)} /> :
            <Label theme={theme}>Tidak ada sesi terjadwal minggu ini.</Label>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button theme={theme} variant="outline" disabled={busy || destinationWeek <= -520} onPress={() => { setDestinationWeek(value => value - 1); setTarget(""); }}>Minggu sebelumnya</Button>
            <Button theme={theme} variant="outline" disabled={busy || destinationWeek >= 520} onPress={() => { setDestinationWeek(value => value + 1); setTarget(""); }}>Minggu berikutnya</Button>
          </View>
          {destination ? <><Label theme={theme}>{destination.from} sampai {destination.to}</Label>
            {targets.length ? <Choices theme={theme} label="Slot tujuan" value={target} change={setTarget} disabled={busy}
              options={targets.map(item => [item.id, `${item.date} · ${item.start}`] as const)} /> : <Label theme={theme}>Tidak ada slot tujuan minggu ini.</Label>}</> :
            loaded?.week === destinationWeek ? <Button theme={theme} onPress={() => { setLoaded(undefined); setFetchAttempt(value => value + 1); }}>Muat ulang slot</Button> : <Label theme={theme}>Memuat slot…</Label>}
          <Input theme={theme} value={reason} onChangeText={setReason} editable={!busy} maxLength={2000} accessibilityLabel="Alasan pindah sesi" placeholder="Alasan (opsional)" />
        </> : null}
      </>}
      {notice ? <Label theme={theme}>{notice}</Label> : null}
      <Button theme={theme} disabled={busy || (!pending && !command)} onPress={() => void submit()}>{pending ? "Periksa pengiriman" : labels[mode]}</Button>
    </SharedDialog>
  </View>;
}
