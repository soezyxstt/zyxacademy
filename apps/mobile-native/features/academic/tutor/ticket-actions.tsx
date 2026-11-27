import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { TutorScheduleData } from "../../../../../packages/academic/tutor-support";
import type { TutorTicketCommand, TutorTicketEditor } from "../../../../../packages/academic/tutor-ticket";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicScreenProps } from "../contracts";
import { Label, tutorLayout } from "./ui";

type Ticket = TutorScheduleData["tickets"][number];
type Mode = "reply" | "approved" | "rejected";
const actionLabels = { approved: "Setujui tiket", rejected: "Tolak tiket", reply: "Balas" };

export function TicketActions({ ticket, editor, theme, refresh, denied }: {
  ticket: Ticket; editor: TutorTicketEditor; theme: AcademicScreenProps["theme"]; refresh(): Promise<void>; denied(): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const frozen = editor.pending(ticket.id);
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [editor, ticket.id]);

  function open(next: Mode) { setMode(next); setText(""); setStatus(""); }
  async function send() {
    if (!canInteract() || pending.current || (!mode && !frozen)) return;
    const command: TutorTicketCommand | undefined = frozen?.command ?? (mode === "reply" ? { action: "reply", message: text.trim() }
      : mode ? { action: "decide", decision: mode, notes: text.trim() } : undefined);
    if (!command || (command.action === "reply" && !command.message)) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const result = await editor.submit(ticket.id, frozen ?? { command, requestId: randomUUID() }, controller.signal);
      if (controller.signal.aborted || !canInteract()) return;
      if (result === "saved") {
        setMode(null); setText(""); setStatus(command.action === "reply" ? "Balasan terkirim." : "Keputusan tersimpan.");
        await refresh();
      } else if (result === "denied") denied();
      else if (result === "conflict" || result === "missing") {
        setMode(null); setStatus("Tiket atau jadwal telah berubah. Periksa keadaan terbaru."); await refresh();
      } else setStatus(result === "unknown" ? "Hasil pengiriman belum diketahui." : "Periksa isi permintaan.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <View style={tutorLayout.group}>
    {ticket.groupName ? <Label theme={theme}>{ticket.groupName}</Label> : null}
    {ticket.decisionNotes ? <Label theme={theme}>{ticket.decisionNotes}</Label> : null}
    {ticket.messages?.map(message => <Label theme={theme} key={message.id}>{[message.sender, message.message].filter(Boolean).join(" · ")}</Label>)}
    {frozen ? <Button theme={theme} variant="outline" disabled={busy} onPress={() => void send()}>Periksa pengiriman</Button>
      : mode ? <>
        <Input theme={theme} accessibilityLabel={mode === "reply" ? "Balasan" : "Catatan keputusan"} multiline maxLength={2000}
          placeholder={mode === "reply" ? "Balasan" : "Catatan keputusan (opsional)"} editable={!busy} value={text} onChangeText={setText} />
        <Button theme={theme} disabled={busy || (mode === "reply" && !text.trim())}
          onPress={() => void send()}>{mode === "reply" ? "Kirim balasan" : actionLabels[mode]}</Button>
        <Button theme={theme} variant="ghost" disabled={busy} onPress={() => setMode(null)}>Batal</Button>
      </> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(ticket.status === "pending" ? ["approved", "rejected", "reply"] as const : ["reply"] as const).map(next =>
          <Button theme={theme} key={next} variant="outline" disabled={busy} onPress={() => open(next)}>{actionLabels[next]}</Button>)}
      </View>}
    {status ? <Label theme={theme}>{status}</Label> : null}
  </View>;
}
