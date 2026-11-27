import { setStringAsync } from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { isGroupDeletionView, type GroupDeletion, type GroupDeletionTarget, type GroupDeletionView } from "../../../../../packages/academic/group-deletion";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicTransport } from "../client";
import { Action, CourseStatus, Ink, layout } from "./ui";

const endpoint = "/api/native/academic-administration/group-deletion";
type Pending = { command: GroupDeletion; requestId: string; view: GroupDeletionView };
const pendingBySession = new WeakMap<AcademicTransport, Map<string, Pending>>();

export function GroupDeletionControl({ transport, target, deleted }: {
  transport: AcademicTransport; target: GroupDeletionTarget; deleted(): void;
}) {
  const key = target.kind + ":" + target.id;
  const recovered = pendingBySession.get(transport)?.get(key);
  const [pending, setPending] = useState(recovered);
  const [view, setView] = useState(recovered?.view);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [transport, key]);
  const token = target.kind === "token";

  async function inspect() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setMessage("");
    try {
      const response = await transport.get(endpoint + "?" + new URLSearchParams(target), controller.signal);
      if (!response.ok) { setMessage(response.status === 404 ? "Kelompok tidak ditemukan." : "Dampak penghapusan belum dapat diperiksa."); return; }
      const data: unknown = await response.json();
      if (!isGroupDeletionView(data) || data.id !== target.id || data.kind !== target.kind) throw new Error("Invalid group snapshot");
      if (!controller.signal.aborted) setView(data);
    } catch {
      if (!controller.signal.aborted) setMessage("Dampak penghapusan belum dapat diperiksa.");
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function remove() {
    if (!transport.command || !view || operation.current) return;
    const operationDraft = pending ?? { requestId: randomUUID(), view, command: {
      ...target, action: "delete" as const, groupId: view.groupId, expectedRevision: view.revision, confirmed: true as const,
    } };
    const session = pendingBySession.get(transport) ?? new Map<string, Pending>();
    session.set(key, operationDraft);
    pendingBySession.set(transport, session);
    setPending(operationDraft);
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setMessage("");
    try {
      const response = await transport.command(endpoint, {
        method: "POST", body: operationDraft.command, requestId: operationDraft.requestId,
      }, controller.signal);
      if (controller.signal.aborted) return;
      const data: unknown = await response.json().catch(() => null);
      if (response.ok && data && typeof data === "object" && "status" in data && data.status === "saved" && "id" in data && data.id === target.id
        && "requestId" in data && data.requestId === operationDraft.requestId) {
        session.delete(key);
        deleted();
      } else if ([400, 401, 403, 404, 409, 422].includes(response.status)) {
        session.delete(key);
        setPending(undefined);
        setView(undefined);
        setMessage(response.status === 409 ? "Kelompok berubah. Periksa dampaknya kembali."
          : response.status === 401 || response.status === 403 ? "Akses admin diperlukan." : "Kelompok tidak tersedia untuk dihapus.");
      } else {
        setMessage("Penghapusan belum terkonfirmasi.");
      }
    } catch {
      if (!controller.signal.aborted) setMessage("Penghapusan belum terkonfirmasi.");
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (!transport.command) return null;
  return <View style={layout.group}>
    {message ? <CourseStatus label={message} error /> : null}
    {view ? <>
      <Ink kind="strong">{view.name}</Ink>
      <Ink>{`${view.members} anggota · ${view.bookings} pemesanan · ${view.tokens} token`}</Ink>
      <Ink>{token ? "Token dan kelompok tertaut akan dihapus." : "Kelompok dan token tertaut akan dihapus."}</Ink>
      <View style={layout.row}>
        <Action label={pending ? "Periksa penghapusan" : "Ya, hapus kelompok"} variation="destructive"
          disabled={busy} onPress={() => void remove()} testID="admin-group-confirm-delete" />
        {!pending ? <Action label="Batal" disabled={busy} onPress={() => { setView(undefined); setMessage(""); }} /> : null}
      </View>
    </> : <Action label={token ? "Hapus token dan kelompok" : "Hapus kelompok"} variation="destructive" disabled={busy}
      onPress={() => void inspect()} testID="admin-group-review-delete" />}
    {busy ? <CourseStatus label="Memeriksa…" /> : null}
  </View>;
}

export function CopyActivationToken({ value, locale, label, canCopy }: {
  value: string; locale?: string; label?: string; canCopy?(): boolean;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const en = locale === "en";
  const [message, setMessage] = useState<"copied" | "failed">();
  const current = () => !suspended && canInteract() && (canCopy?.() ?? true);
  async function copy() {
    if (!current()) return;
    const copied = await setStringAsync(value).catch(() => false);
    if (current()) setMessage(copied ? "copied" : "failed");
  }

  return <>
    <Action label={label ?? (en ? "Copy token" : "Salin token")} onPress={() => void copy()} />
    {message ? <CourseStatus label={message === "copied" ? (en ? "Token copied." : "Token disalin.")
      : (en ? "Could not copy the token." : "Token tidak dapat disalin.")} /> : null}
  </>;
}
