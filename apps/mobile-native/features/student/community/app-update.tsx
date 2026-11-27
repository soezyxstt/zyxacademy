import { useEffect, useRef, useState } from "react";
import type { ExpoAndroidRelease } from "../../../../../packages/native-session/expo-android-update";
import { getAndroidUpdateDevice, type AndroidUpdateResult } from "../../../device/android-update";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Action, Actions, Copy, useCommunity } from "./ui";

type State = "idle" | "checking" | "current" | "available" | "check-error" | "downloading" | AndroidUpdateResult;

export function AppUpdatePanel() {
  const { tr, session } = useCommunity();
  const { canInteract, suspended } = useProtectedInteraction();
  const [device] = useState(getAndroidUpdateDevice);
  const [state, setState] = useState<State>("idle");
  const [release, setRelease] = useState<ExpoAndroidRelease | null>(null);
  const [progress, setProgress] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const downloading = useRef(false);

  useEffect(() => {
    if (!device) return;
    const progress = device.subscribe(percent => {
      if (downloading.current && !pending.current?.signal.aborted) setProgress(percent);
    });
    return () => {
      pending.current?.abort();
      if (downloading.current) void device.cancel().catch(() => {});
      progress.remove();
    };
  }, [device]);
  useEffect(() => {
    if (suspended && downloading.current && device) {
      pending.current?.abort();
      void device.cancel().catch(() => {});
      setState("cancelled");
    }
  }, [device, suspended]);

  if (!device) return null;

  async function check() {
    if (!device || pending.current || !canInteract()) return;
    const controller = new AbortController();
    pending.current = controller;
    setState("checking");
    setRelease(null);
    try {
      const next = await device.check(controller.signal);
      if (controller.signal.aborted) return;
      if (!canInteract()) { setState("idle"); return; }
      setRelease(next);
      setState(next ? "available" : "current");
    } catch {
      if (!controller.signal.aborted) setState("check-error");
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  async function install() {
    if (!device || pending.current || !canInteract() || !release) return;
    const controller = new AbortController();
    pending.current = controller;
    downloading.current = true;
    setProgress(0);
    setState("downloading");
    try {
      const result = await device.install(release);
      if (!controller.signal.aborted) setState(result);
    } catch {
      if (!controller.signal.aborted) setState("failed");
    } finally {
      downloading.current = false;
      if (pending.current === controller) pending.current = null;
    }
  }

  const size = release ? new Intl.NumberFormat(session.locale, { maximumFractionDigits: 1 }).format(release.bytes / (1024 * 1024)) : "";
  return <>
    <Copy kind="heading">{tr("Versi aplikasi", "App version")}</Copy>
    <Copy kind="muted">{device.installed.version} ({device.installed.versionCode})</Copy>
    {state === "current" && <Copy kind="muted">{tr("Tidak ada pembaruan yang cocok.", "No compatible update is available.")}</Copy>}
    {state === "check-error" && <Copy kind="error">{tr("Pembaruan belum dapat diperiksa.", "Could not check for updates.")}</Copy>}
    {state === "invalid" && <Copy kind="error">{tr("Paket pembaruan tidak cocok dengan aplikasi ini.", "The update package does not match this app.")}</Copy>}
    {(state === "failed" || state === "busy") && <Copy kind="error">{tr("Pembaruan belum siap dipasang.", "The update could not be prepared.")}</Copy>}
    {state === "permission-required" && <Copy kind="muted">{tr("Izinkan aplikasi ini memasang pembaruan di pengaturan Android, lalu coba lagi.", "Allow this app to install updates in Android settings, then try again.")}</Copy>}
    {state === "confirmation-opened" && <Copy kind="muted">{tr("Selesaikan pemasangan di Android.", "Finish installation in Android.")}</Copy>}
    {state === "cancelled" && <Copy kind="muted">{tr("Unduhan dibatalkan.", "Download cancelled.")}</Copy>}
    {state === "downloading" ? <Actions>
      <Copy kind="muted">{tr("Mengunduh", "Downloading")} {progress}%</Copy>
      <Action label={tr("Batalkan", "Cancel")} onPress={() => {
        pending.current?.abort();
        void device.cancel().catch(() => {});
        setState("cancelled");
      }} />
    </Actions> : <Actions>
      {release && state !== "invalid" ? <Action label={tr(`Unduh ${release.version} (${size} MB)`, `Download ${release.version} (${size} MB)`)}
        onPress={() => void install()} /> : <Action label={tr("Periksa pembaruan", "Check for updates")}
          busy={state === "checking"} onPress={() => void check()} />}
      {state === "permission-required" && <Action label={tr("Buka pengaturan Android", "Open Android settings")}
        onPress={() => { if (canInteract()) void device.openInstallSettings().then(opened => {
          if (!opened) setState("failed");
        }).catch(() => setState("failed")); }} />}
    </Actions>}
  </>;
}
