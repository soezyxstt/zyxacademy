import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AdminUserStatusEdit, AdminUserStatusRevision } from "../../../../../packages/academic/admin-user-status";
import type { AcademicTransport } from "../client";
import { saveUserStatus } from "./user-status-client";
import { Action, CourseDialog, Ink, layout } from "./ui";

type Pending = { draft: AdminUserStatusEdit; requestId: string };
const pendingEdits = new WeakMap<AcademicTransport, Map<string, Pending>>();
const messages = {
  invalid: "Perubahan status tidak dapat dilakukan.",
  missing: "Akun tidak ditemukan.",
  stale: "Status akun telah berubah. Muat ulang sebelum mencoba lagi.",
};

export function UserStatusEditor({ id, name, email, initial, transport, close, refresh, denied, saved }: {
  id: string; name: string; email?: string; initial: AdminUserStatusRevision; transport: AcademicTransport;
  close(): void; refresh(): void; denied(): void; saved(): void;
}) {
  const [pending, setPending] = useState(() => pendingEdits.get(transport)?.get(id));
  const [error, setError] = useState<keyof typeof messages>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => { inFlight.current?.abort(); inFlight.current = undefined; }, [transport]);

  const nextStatus = pending?.draft.status ?? (initial.status === "active" ? "suspended" : "active");
  const suspend = nextStatus === "suspended";
  const label = suspend ? "Tangguhkan akun" : "Aktifkan akun";

  async function submit(command: Pending) {
    if (inFlight.current) return;
    const commands = pendingEdits.get(transport) ?? new Map<string, Pending>();
    commands.set(id, command);
    pendingEdits.set(transport, commands);
    const controller = new AbortController();
    inFlight.current = controller;
    setError(undefined);
    setBusy(true);
    try {
      const result = await saveUserStatus(transport, id, command.draft, command.requestId, controller.signal);
      if (controller.signal.aborted) return;
      if (result === "uncertain") { setPending(command); return; }
      if (commands.get(id) === command) commands.delete(id);
      setPending(undefined);
      if (result === "saved") saved();
      else if (result === "denied") denied();
      else setError(result);
    } catch {
      if (!controller.signal.aborted) setPending(command);
    } finally {
      if (inFlight.current === controller) inFlight.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <CourseDialog title={label} onClose={close} dismissDisabled={busy}>
    <Ink kind="strong">{name}</Ink>
    {email ? <Ink>{email}</Ink> : null}
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{messages[error]}</Ink></View> : null}
    {pending ? <View accessibilityLiveRegion="polite"><Ink>Hasil perubahan belum diketahui.</Ink></View> : null}
    <View style={layout.row}>
      <Action label={pending ? "Tutup" : "Batal"} onPress={close} disabled={busy} />
      {error ? <Action label="Muat ulang" onPress={refresh} /> : <Action
        label={busy ? "Menyimpan…" : pending ? "Coba lagi" : label} disabled={busy} variation={suspend ? "destructive" : "default"}
        testID="academic-live-confirm-user-status" onPress={() => void submit(pending ?? {
          requestId: randomUUID(), draft: { accountId: transport.accountId, status: nextStatus, expectedRevision: initial.revision },
        })} />}
    </View>
  </CourseDialog>;
}
