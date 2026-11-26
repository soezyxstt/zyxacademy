import { useState } from "react";
import { accountSessions, accountSessionsPath } from "../../../../../packages/student-community/account-sessions";
import { Action, Actions, Copy, Notice, Remote, Row, Rows, dateLabel, operationResult, readJson, useCommunity, useOperation, useRemote } from "./ui";

export function AccountSessionsPanel() {
  const { session, tr, request, focused = true } = useCommunity();
  const listed = useRemote<unknown>(focused ? accountSessionsPath : null);
  const rows = listed.data === undefined ? undefined : accountSessions(listed.data, session.sessionId);
  const [confirm, setConfirm] = useState<string>();
  const action = useOperation();
  function revoke(id: string) {
    if (!focused || confirm !== id || !rows?.some(row => row.id === id && !row.current)) return;
    void action.run(async () => {
      try {
        operationResult(await readJson(request, accountSessionsPath, {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
        }));
      } finally {
        setConfirm(undefined);
        listed.reload();
      }
    }, tr("Perangkat telah keluar.", "Device signed out."), tr("Hasil belum terkonfirmasi. Periksa daftar perangkat.", "Sign-out was not confirmed. Check the device list."));
  }
  return <>
    <Copy kind="heading">{tr("Perangkat yang masuk", "Signed-in devices")}</Copy>
    <Notice notice={action.notice} />
    <Remote state={{ ...listed, data: rows ?? undefined, error: rows === null ? new Error("Invalid session list") : listed.error }}>
      {devices => <Rows>{devices.map(device => {
        const name = device.label || tr("Perangkat tidak dikenal", "Unknown device");
        return <Row key={device.id} title={name} aside={device.current ? tr("Perangkat ini", "This device") : undefined}
          meta={tr("Masuk", "Signed in") + " · " + dateLabel(device.createdAt, session.locale, true)}>
          <Copy kind="muted">{tr("Sesi diperbarui", "Session renewed")} · {dateLabel(device.updatedAt, session.locale, true)}</Copy>
          {!device.current && (confirm === device.id ? <>
            <Copy>{tr("Keluarkan perangkat ini?", "Sign out this device?")} {name}</Copy>
            <Actions><Action label={tr("Keluarkan", "Sign out")} mode="destructive" busy={action.pending} onPress={() => revoke(device.id)} />
              <Action label={tr("Batal", "Cancel")} disabled={action.pending} onPress={() => setConfirm(undefined)} /></Actions>
          </> : <Actions><Action label={tr("Keluarkan perangkat", "Sign out device")} disabled={action.pending} onPress={() => setConfirm(device.id)} /></Actions>)}
        </Row>;
      })}</Rows>}
    </Remote>
  </>;
}
